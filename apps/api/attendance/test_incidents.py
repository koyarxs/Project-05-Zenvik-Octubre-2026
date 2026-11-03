import uuid
from datetime import datetime, timedelta
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.test import TestCase, TransactionTestCase
from django.db import DatabaseError, transaction, close_old_connections
from django.utils import timezone
from rest_framework.test import APIClient
from businesses.models import Business, Employee, Membership, Shift
from .tests import fixture, payload, validated, NOW
from .services import record_event, configure_policy, Conflict
from .models import AttendanceIncident, AttendanceCorrection, AttendanceAudit, AttendanceNotification, IncidentDecision, AttendanceSession, AttendanceEvent
from .incidents import create_incident, decide_incident, configure, policy_data, scan_incomplete
from .incident_views import IncidentInput, DecisionInput


def request_data(session=None, **extra):
    return {'request_id': str(uuid.uuid4()), 'work_date': NOW.date().isoformat(), 'category':'MISSING_CLOCK_OUT',
        'event_type':'CLOCK_OUT', 'session':str(session.pk) if session else None, 'declared_at':(NOW+timedelta(hours=1)).isoformat(),
        'reason':'Olvidé registrar la salida al terminar mi jornada.', **extra}

def cleaned(data):
    item = IncidentInput(data=data); item.is_valid(raise_exception=True); return item.validated_data

def decision(state='APPROVED', version=1, **extra):
    item = DecisionInput(data={'request_id':str(uuid.uuid4()), 'expected_version':version, 'state':state, 'reason':'Verificado con los antecedentes de la jornada.', **extra})
    item.is_valid(raise_exception=True); return item.validated_data

class IncidentTests(TestCase):
    def setUp(self):
        self.business, self.owner, self.user, self.peer, self.employee = fixture()
        self.client = APIClient(); self.client.force_login(self.user)
        self.base = f'/api/v1/businesses/{self.business.pk}/attendance/'
        with patch('attendance.services.timezone.now', return_value=NOW):
            self.event, _ = record_event(self.user, self.business.pk, validated(payload()))
        self.session = self.event.session
        self.now = patch('attendance.incidents.timezone.now', return_value=NOW+timedelta(hours=2)); self.now.start(); self.addCleanup(self.now.stop)

    def create(self, **extra):
        return create_incident(self.user, self.business.pk, cleaned(request_data(extra.pop('session', self.session), **extra)))[0]

    def test_create_own_idempotent_and_no_spoofed_identity(self):
        data = request_data(self.session)
        first = self.client.post(self.base+'incidents/', data, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(self.client.post(self.base+'incidents/', data, format='json').status_code, 200)
        self.assertEqual(AttendanceIncident.objects.count(), 1)
        self.assertEqual(AttendanceNotification.objects.count(), 1)
        self.assertEqual(AttendanceAudit.objects.filter(action='INCIDENT_CREATED').count(), 1)
        self.assertEqual(self.client.post(self.base+'incidents/', {**data, 'employee':str(self.employee.pk)}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.base+'incidents/', {**data, 'reason':'Contenido diferente'}, format='json').status_code, 409)

    def test_foreign_worker_business_ids_and_gps_fields(self):
        self.client.force_login(self.peer)
        self.assertEqual(self.client.post(self.base+'incidents/', request_data(self.session), format='json').status_code, 404)
        self.client.force_login(self.user)
        self.assertEqual(self.client.post(self.base+'incidents/', request_data(self.session, latitude=0), format='json').status_code, 400)
        item = self.create()
        other = Business.objects.create(name='Otro negocio')
        Membership.objects.create(business=other, user=self.user, role='EMPLOYEE')
        foreign_base = self.base.replace(str(self.business.pk), str(other.pk))
        self.assertEqual(self.client.get(foreign_base+f'incidents/{item.pk}/').status_code, 404)
        self.client.force_login(self.peer)
        self.assertEqual(self.client.get(self.base+f'incidents/{item.pk}/').status_code, 404)
        self.assertEqual(self.client.get(self.base+'incidents/').data['count'], 0)
        self.assertEqual(self.client.get(self.base+'audit/').status_code, 403)

    def test_approval_preserves_originals_and_correction_is_explicit(self):
        item = self.create(); original = list(AttendanceEvent.objects.values())
        decide_incident(self.owner, self.business.pk, item.pk, decision())
        self.assertEqual(list(AttendanceEvent.objects.values()), original)
        self.session.refresh_from_db(); self.assertEqual(self.session.state, 'WORKING')
        correction = AttendanceCorrection.objects.get(); self.assertEqual(correction.state, 'OPERATIONAL_ONLY')
        self.assertIsNone(correction.original_at)
        self.assertEqual(correction.declared_at, NOW+timedelta(hours=1))
        response = self.client.get(self.base+f'incidents/{item.pk}/')
        self.assertFalse(response.data['official_application_enabled'])
        self.assertEqual(response.data['decisions'][0]['state'], 'APPROVED')
        self.assertEqual(datetime.fromisoformat(response.data['original_session']['events'][0]['recorded_at'].replace('Z', '+00:00')), self.event.recorded_at)
        self.assertEqual(self.client.get(self.base+'incidents/corrections/').data['count'], 1)
        self.assertNotIn('latitude', str(response.data))

    def test_review_reject_cancel_and_invalid_transitions(self):
        item = self.create()
        decide_incident(self.owner, self.business.pk, item.pk, decision('IN_REVIEW'))
        decide_incident(self.owner, self.business.pk, item.pk, decision('REJECTED', 2))
        with self.assertRaises(Conflict):
            decide_incident(self.owner, self.business.pk, item.pk, decision('APPROVED', 3))
        cancelled = self.create(category='OTHER', event_type='', declared_at=None)
        decide_incident(self.user, self.business.pk, cancelled.pk, decision('CANCELLED'))
        self.assertEqual(IncidentDecision.objects.count(), 3)
        with self.assertRaises(PermissionDenied):
            decide_incident(self.user, self.business.pk, item.pk, decision())

    def test_no_self_approval_even_owner_and_reassigned_identity(self):
        Membership.objects.filter(business=self.business, user=self.user).update(role='OWNER')
        item = self.create()
        with self.assertRaises(PermissionDenied):
            decide_incident(self.user, self.business.pk, item.pk, decision())
        Membership.objects.filter(business=self.business, user=self.user).update(role='EMPLOYEE')
        self.employee.user = self.owner; self.employee.save()
        with self.assertRaises(PermissionDenied):
            decide_incident(self.owner, self.business.pk, item.pk, decision())

    def test_decision_replay_stale_version_and_overlapping_amendment(self):
        item = self.create(); data = decision()
        decide_incident(self.owner, self.business.pk, item.pk, data)
        _, created = decide_incident(self.owner, self.business.pk, item.pk, data)
        self.assertFalse(created)
        self.assertEqual(IncidentDecision.objects.count(), 1)
        with self.assertRaises(Conflict):
            decide_incident(self.owner, self.business.pk, item.pk, {**data, 'reason':'Otro contenido'})
        other = self.create()
        with self.assertRaises(Conflict):
            decide_incident(self.owner, self.business.pk, other.pk, decision())
        self.assertEqual(AttendanceCorrection.objects.count(), 1)

    def test_correction_original_value_and_incompatible_time(self):
        item = self.create(category='SCHEDULE_DIFFERENCE', event_type='CLOCK_IN', event=str(self.event.pk), declared_at=(NOW-timedelta(minutes=5)).isoformat())
        decide_incident(self.owner, self.business.pk, item.pk, decision())
        self.assertEqual(AttendanceCorrection.objects.get().original_at, NOW)
        invalid = self.create(declared_at=(NOW-timedelta(hours=1)).isoformat())
        with self.assertRaises(ValidationError):
            decide_incident(self.owner, self.business.pk, invalid.pk, decision())
        invalid.refresh_from_db(); self.assertEqual(invalid.status, 'PENDING')

    def test_missing_entry_without_fake_session_and_shift(self):
        before = AttendanceSession.objects.count()
        item = self.create(session=None, event_type='CLOCK_IN', category='MISSING_CLOCK_IN', declared_at=NOW.isoformat())
        decide_incident(self.owner, self.business.pk, item.pk, decision())
        self.assertEqual(AttendanceSession.objects.count(), before)
        self.assertIsNone(item.session_id)

    def test_notifications_read_ownership_and_revocation(self):
        item = self.create(); owner_notification = AttendanceNotification.objects.get()
        self.assertEqual(self.client.post(self.base+f'notifications/{owner_notification.pk}/read/', {}, format='json').status_code, 404)
        decide_incident(self.owner, self.business.pk, item.pk, decision('REJECTED'))
        unread = self.client.get(self.base+'notifications/').data
        self.assertEqual(unread['unread_count'], 1)
        pk = unread['results'][0]['id']
        self.assertEqual(self.client.post(self.base+f'notifications/{pk}/read/', {}, format='json').status_code, 200)
        self.assertEqual(self.client.post(self.base+f'notifications/{pk}/read/', {}, format='json').status_code, 200)
        self.assertEqual(self.client.get(self.base+'notifications/').data['unread_count'], 0)
        self.client.force_login(self.owner)
        Membership.objects.filter(business=self.business, user=self.owner).update(role='EMPLOYEE')
        self.assertEqual(self.client.get(self.base+'notifications/').data['count'], 0)

    def test_policy_roles_deadline_categories_and_audit(self):
        policy = policy_data(self.business); policy['expected_version'] = policy.pop('version')
        policy.update(request_days=0, admin_review_enabled=False, categories={'CUSTOM':'Categoría local'})
        with self.assertRaises(PermissionDenied):
            configure(self.user, self.business.pk, policy)
        configure(self.owner, self.business.pk, policy)
        with self.assertRaises(ValidationError):
            self.create()
        item = self.create(work_date=(NOW+timedelta(hours=2)).date().isoformat(), session=None, category='CUSTOM', declared_at=None, event_type='')
        Membership.objects.filter(business=self.business, user=self.peer).update(role='ADMIN')
        with self.assertRaises(PermissionDenied):
            decide_incident(self.peer, self.business.pk, item.pk, decision())
        self.assertEqual(AttendanceAudit.objects.filter(action='INCIDENT_POLICY_CHANGED').count(), 1)

    def test_filters_pagination_and_csrf(self):
        for _ in range(12): self.create(category='OTHER', declared_at=None, event_type='')
        data = self.client.get(self.base+'incidents/?category=OTHER&page=2').data
        self.assertEqual(data['count'], 12); self.assertEqual(len(data['results']), 2)
        for query in ['page=0','ordering=password','unknown=x','date_from=2026-12-01&date_to=2026-01-01']:
            self.assertEqual(self.client.get(self.base+'incidents/?'+query).status_code, 400)
        secure = APIClient(enforce_csrf_checks=True); secure.force_login(self.user)
        self.assertEqual(secure.post(self.base+'incidents/', request_data(self.session), format='json').status_code, 403)

    def test_immutable_evidence_decisions_audit_and_notification(self):
        item = self.create(); decide_incident(self.owner, self.business.pk, item.pk, decision())
        for operation in [lambda: AttendanceIncident.objects.update(reason='Altered'), lambda: IncidentDecision.objects.all().delete(), lambda: AttendanceCorrection.objects.update(declared_at=NOW), lambda: AttendanceAudit.objects.all().delete(), lambda: AttendanceNotification.objects.update(code='Altered')]:
            with self.assertRaises(DatabaseError), transaction.atomic(): operation()

    def test_configured_alerts_and_no_duplicate(self):
        policy = policy_data(self.business); policy['expected_version'] = policy.pop('version'); policy.update(exceptional_alerts=True, incomplete_after_minutes=5)
        configure(self.owner, self.business.pk, policy)
        session = self.session
        session.shift_snapshot = {'ends_at': (NOW-timedelta(hours=1)).isoformat()}; session.save()
        self.assertEqual(scan_incomplete(self.business), 1); self.assertEqual(scan_incomplete(self.business), 0)
        record_event(self.user, self.business.pk, validated(payload('BREAK_START', session, location=None, location_status='DENIED')))
        self.assertEqual(AttendanceNotification.objects.filter(code='EXCEPTIONAL_EVENT').count(), 1)

from rest_framework.exceptions import PermissionDenied, ValidationError

class IncidentConcurrencyTests(TransactionTestCase):
    def test_two_decisions_only_one_commits_and_replay_deduplicates(self):
        business, owner, user, _, _ = fixture()
        data = cleaned(request_data(category='OTHER', event_type='', declared_at=None))
        item, _ = create_incident(user, business.pk, data)
        barrier = Barrier(2)
        def run(index):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                decide_incident(owner, business.pk, item.pk, decision('APPROVED' if index == 0 else 'REJECTED'))
                return 'ok'
            except Conflict: return 'conflict'
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(run, [0,1]))
        self.assertEqual(sorted(results), ['conflict','ok'])
        self.assertEqual(IncidentDecision.objects.count(), 1)
        self.assertEqual(AttendanceNotification.objects.filter(recipient=user).count(), 1)

    def test_concurrent_creation_replays_once(self):
        business, _, user, _, _ = fixture()
        data = cleaned(request_data(category='OTHER', event_type='', declared_at=None))
        barrier = Barrier(2)
        def run(_):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return str(create_incident(user, business.pk, data)[0].pk)
            finally: close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(run, [0,1]))
        self.assertEqual(results[0], results[1])
        self.assertEqual(AttendanceIncident.objects.count(), 1)
        self.assertEqual(AttendanceNotification.objects.count(), 1)


class IncidentMigrationTests(TransactionTestCase):
    def test_stage13_originals_preserved_through_new_migrations(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        business, _, user, _, _ = fixture()
        with patch('attendance.services.timezone.now', return_value=NOW):
            event, _ = record_event(user, business.pk, validated(payload()))
        before = AttendanceEvent.objects.values().get(pk=event.pk)
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        try:
            executor.migrate([('attendance','0008_rejection_immutable')])
            old = MigrationExecutor(connection).loader.project_state([('attendance','0008_rejection_immutable')]).apps.get_model('attendance','AttendanceEvent')
            self.assertEqual(old.objects.values().get(pk=event.pk), before)
        finally:
            MigrationExecutor(connection).migrate(latest)
        self.assertEqual(AttendanceEvent.objects.values().get(pk=event.pk), before)
        self.assertEqual(AttendanceIncident.objects.count(), 0)
