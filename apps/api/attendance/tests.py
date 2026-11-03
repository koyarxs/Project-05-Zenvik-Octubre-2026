import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import DatabaseError, close_old_connections, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient
from businesses.models import Business, Employee, Membership, Shift
from .models import AttendanceEvent, AttendancePolicyRevision, AttendanceSession
from .serializers import EventInput
from .services import Conflict, configure_policy, distance_meters, geographic_result, record_event

NOW = datetime(2026, 11, 1, 23, 30, tzinfo=ZoneInfo('America/Santiago'))


def fixture():
    business = Business.objects.create(name='Attendance test')
    owner = get_user_model().objects.create_user(username='attendance-owner', email='a-owner@example.test')
    user = get_user_model().objects.create_user(username='attendance-worker', email='a-worker@example.test')
    peer = get_user_model().objects.create_user(username='attendance-peer', email='a-peer@example.test')
    for person, role in [(owner, 'OWNER'), (user, 'EMPLOYEE'), (peer, 'EMPLOYEE')]:
        Membership.objects.create(user=person, business=business, role=role)
    employee = Employee.objects.create(user=user, business=business, first_name='Clara', last_name='Attendance')
    Employee.objects.create(user=peer, business=business, first_name='Peer', last_name='Attendance')
    return business, owner, user, peer, employee


def payload(event_type='CLOCK_IN', session=None, **extra):
    return {'event_type': event_type, 'request_id': str(uuid.uuid4()), 'session_id': str(session.pk) if session else None,
            'expected_version': session.version if session else 0, 'location': {'latitude': -33.45, 'longitude': -70.66, 'accuracy_meters': 10}, 'location_status': 'AVAILABLE', 'exception_reason': '', **extra}


def validated(data):
    serializer = EventInput(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


@override_settings(SESSION_COOKIE_AGE=604800)
class AttendanceTests(TestCase):
    def setUp(self):
        self.business, self.owner, self.user, self.peer, self.employee = fixture()
        self.client = APIClient()
        self.client.force_login(self.user)
        self.base = f'/api/v1/businesses/{self.business.pk}/attendance/'

    def mark(self, event_type='CLOCK_IN', session=None, **extra):
        with patch('attendance.services.timezone.now', return_value=NOW):
            response = self.client.post(self.base + 'events/', payload(event_type, session, **extra), format='json')
        return response

    def session(self):
        return AttendanceSession.objects.get()

    def test_four_events_receipt_and_history(self):
        ids = []
        for action in ['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']:
            response = self.mark(action, self.session() if ids else None)
            self.assertEqual(response.status_code, 201, response.data)
            ids.append(response.data['receipt']['id'])
        self.assertEqual(self.session().state, 'FINISHED')
        self.assertEqual(self.session().version, 4)
        self.assertEqual(AttendanceEvent.objects.count(), 4)
        events = list(AttendanceEvent.objects.order_by('sequence'))
        self.assertEqual(events[1].previous_hash, events[0].integrity_hash)
        receipt = self.client.get(self.base + f'receipts/{ids[0]}/')
        self.assertEqual(receipt.status_code, 200)
        self.assertNotIn('latitude', receipt.data)
        history = self.client.get(self.base + 'history/')
        self.assertEqual(history.data['count'], 1)
        self.assertEqual(len(history.data['results'][0]['events']), 4)

    def test_invalid_transitions_do_not_persist(self):
        for action in ['BREAK_START', 'BREAK_END', 'CLOCK_OUT']:
            self.assertEqual(self.mark(action).status_code, 409)
        self.mark()
        for action in ['CLOCK_IN', 'BREAK_END']:
            self.assertEqual(self.mark(action, self.session()).status_code, 409)
        self.mark('BREAK_START', self.session())
        for action in ['BREAK_START', 'CLOCK_OUT']:
            self.assertEqual(self.mark(action, self.session()).status_code, 409)
        self.assertEqual(AttendanceEvent.objects.count(), 2)

    def test_no_break_and_closed_session_cannot_change(self):
        self.mark()
        self.assertEqual(self.mark('CLOCK_OUT', self.session()).status_code, 201)
        for action in ['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']:
            self.assertEqual(self.mark(action, self.session()).status_code, 409)
        self.assertEqual(self.mark().status_code, 201)  # Explicitly new session, never reopen old one.
        self.assertEqual(AttendanceSession.objects.count(), 2)

    def test_multiple_breaks(self):
        self.mark()
        for action in ['BREAK_START', 'BREAK_END', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']:
            self.assertEqual(self.mark(action, self.session()).status_code, 201)

    def test_idempotency_exact_replay_and_conflicting_content(self):
        data = payload()
        first = self.client.post(self.base + 'events/', data, format='json')
        repeated = self.client.post(self.base + 'events/', data, format='json')
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(first.data['receipt']['id'], repeated.data['receipt']['id'])
        data['location']['accuracy_meters'] = 20
        self.assertEqual(self.client.post(self.base + 'events/', data, format='json').status_code, 409)
        self.assertEqual(AttendanceEvent.objects.count(), 1)

    def test_night_work_date_shift_snapshot_and_server_time(self):
        shift = Shift.objects.create(business=self.business, employee=self.employee, starts_at=NOW-timedelta(hours=1), ends_at=NOW+timedelta(hours=7))
        self.mark()
        session = self.session()
        self.assertEqual(session.work_date.isoformat(), '2026-11-01')
        self.assertEqual(session.shift_id, shift.pk)
        with patch('attendance.services.timezone.now', return_value=NOW+timedelta(hours=5)):
            record_event(self.user, self.business.pk, validated(payload('CLOCK_OUT', session)))
        session.refresh_from_db()
        self.assertEqual(session.work_date.isoformat(), '2026-11-01')
        self.assertEqual(session.events.order_by('sequence').last().recorded_at, NOW+timedelta(hours=5))
        shift.refresh_from_db()
        self.assertEqual(shift.starts_at, NOW-timedelta(hours=1))

    def test_unknown_identity_time_and_location_fields_rejected(self):
        for extra in [{'employee_id': str(self.employee.pk)}, {'recorded_at': '2000-01-01'}, {'role': 'OWNER'}, {'business': str(self.business.pk)}]:
            self.assertEqual(self.mark(**extra).status_code, 400)
        for point in [{'latitude': 91, 'longitude': 0, 'accuracy_meters': 1}, {'latitude': 0, 'longitude': -181, 'accuracy_meters': 1}, {'latitude': 'NaN', 'longitude': 0, 'accuracy_meters': 1}, {'latitude': 0, 'longitude': 0, 'accuracy_meters': -1}]:
            self.assertEqual(self.mark(location=point).status_code, 400)
        self.assertEqual(self.mark(location=None, location_status='AVAILABLE').status_code, 400)
        self.assertEqual(AttendanceEvent.objects.count(), 0)

    def policy(self, **extra):
        return configure_policy(self.owner, self.business.pk, {'expected_version': 0, 'location_required': True, 'max_accuracy_meters': 100, 'retention_days': None, 'sites': [], **extra})

    def test_required_location_has_persisted_exception_path(self):
        self.policy()
        self.assertEqual(self.mark(location=None, location_status='DENIED').status_code, 400)
        response = self.mark(location=None, location_status='DENIED', exception_reason='Permiso de ubicación denegado por el dispositivo')
        self.assertEqual(response.status_code, 201)
        event = AttendanceEvent.objects.get()
        self.assertIsNone(event.latitude)
        self.assertEqual(event.geo_result, 'MISSING_LOCATION')
        self.assertIn('denegado', event.exception_reason)

    def test_geofence_outside_not_blocked_and_snapshot_persists(self):
        self.policy(sites=[{'name': 'Zona test', 'latitude': 0, 'longitude': 0, 'radius_meters': 100, 'is_active': True}])
        result = self.mark()
        self.assertEqual(result.status_code, 201)
        event = AttendanceEvent.objects.get()
        self.assertEqual(event.geo_result, 'OUTSIDE')
        self.assertEqual(event.policy_snapshot['sites'][0]['name'], 'Zona test')
        self.assertEqual(AttendancePolicyRevision.objects.count(), 1)

    def test_geography_accuracy_multiple_sites_and_boundary(self):
        policy = {'max_accuracy_meters': 100, 'sites': [{'latitude': 0, 'longitude': 0, 'radius_meters': 100, 'is_active': True}, {'latitude': -33.45, 'longitude': -70.66, 'radius_meters': 100, 'is_active': True}]}
        self.assertEqual(geographic_result(payload()['location'], policy), 'INSIDE')
        self.assertEqual(geographic_result({'latitude': 0, 'longitude': 0.00085, 'accuracy_meters': 20}, policy), 'UNCERTAIN_BOUNDARY')
        self.assertEqual(geographic_result({**payload()['location'], 'accuracy_meters': 101}, policy), 'LOW_ACCURACY')
        self.assertAlmostEqual(distance_meters(0, 0, 0, 1), 111195, delta=1)

    def test_peer_foreign_receipts_and_administration_denied(self):
        receipt = self.mark().data['receipt']['id']
        self.client.force_login(self.peer)
        self.assertEqual(self.client.get(self.base + f'receipts/{receipt}/').status_code, 404)
        self.assertEqual(self.client.get(self.base + 'history/').data['count'], 0)
        self.assertEqual(self.mark('CLOCK_OUT', self.session()).status_code, 404)
        self.assertEqual(self.client.put(self.base + 'policy/', {}, format='json').status_code, 403)
        other = Business.objects.create(name='Private business')
        self.assertEqual(self.client.get(f'/api/v1/businesses/{other.pk}/attendance/current/').status_code, 404)

    def test_revoked_access_and_inactive_worker(self):
        Employee.objects.filter(pk=self.employee.pk).update(is_active=False)
        self.assertEqual(self.mark().status_code, 400)
        self.assertEqual(self.client.get(self.base + 'current/').data['allowed_actions'], [])
        Membership.objects.filter(user=self.user).update(access_enabled=False)
        self.assertEqual(self.client.get(self.base + 'current/').status_code, 404)

    def test_csrf_and_methods_and_no_cache(self):
        secure = APIClient(enforce_csrf_checks=True)
        secure.force_login(self.user)
        self.assertEqual(secure.post(self.base+'events/', payload(), format='json').status_code, 403)
        token = secure.get('/api/v1/auth/csrf/').data['csrfToken']
        self.assertEqual(secure.post(self.base+'events/', payload(), format='json', HTTP_X_CSRFTOKEN=token).status_code, 201)
        self.assertEqual(secure.patch(self.base+'events/', {}, format='json', HTTP_X_CSRFTOKEN=token).status_code, 405)
        self.assertIn('no-store', secure.get(self.base+'history/')['Cache-Control'])

    def test_current_open_night_and_filters(self):
        self.mark()
        with patch('attendance.views.timezone.now', return_value=NOW+timedelta(hours=4)):
            current = self.client.get(self.base+'current/').data
        self.assertEqual(current['state'], 'WORKING')
        self.assertEqual(current['session']['work_date'], '2026-11-01')
        self.assertEqual(current['today_events'], [])
        self.assertEqual(self.client.get(self.base+'history/?date_from=2026-11-02').data['count'], 0)
        self.assertEqual(self.client.get(self.base+'history/?date_from=2026-11-03&date_to=2026-11-01').status_code, 400)

    def test_finished_overnight_events_remain_in_calendar_day_preview(self):
        self.mark()
        tomorrow = NOW + timedelta(hours=4)
        with patch('attendance.services.timezone.now', return_value=tomorrow):
            event, _ = record_event(self.user, self.business.pk, validated(payload('CLOCK_OUT', self.session())))
        with patch('attendance.views.timezone.now', return_value=tomorrow):
            current = self.client.get(self.base+'current/').data
        self.assertEqual(current['state'], 'NOT_STARTED')
        self.assertEqual([row['id'] for row in current['today_events']], [str(event.pk)])

    def test_originals_reject_bulk_updates_and_deletion(self):
        self.mark()
        for operation in [lambda: AttendanceEvent.objects.update(event_type='CLOCK_OUT'), lambda: AttendanceEvent.objects.all().delete()]:
            with self.assertRaises(DatabaseError), transaction.atomic():
                operation()
        self.assertEqual(AttendanceEvent.objects.get().event_type, 'CLOCK_IN')

    def test_stale_policy_and_event_version(self):
        self.policy()
        with self.assertRaises(Conflict):
            self.policy()
        self.mark()
        self.assertEqual(self.mark('CLOCK_OUT', self.session(), expected_version=0).status_code, 409)

    def test_rate_limit_counts_rejected_attempts(self):
        for _ in range(30):
            self.assertEqual(self.client.post(self.base+'events/', {}, format='json').status_code, 400)
        response = self.client.post(self.base+'events/', {}, format='json')
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)


class AttendanceConcurrencyTests(TransactionTestCase):
    def test_concurrent_clock_in_and_same_request(self):
        business, _, user, _, _ = fixture()
        for same in [False, True]:
            if AttendanceSession.objects.exists():
                session = AttendanceSession.objects.get()
                record_event(user, business.pk, validated(payload('CLOCK_OUT', session)))
            barrier = Barrier(2)
            data = payload()
            def execute(index):
                close_old_connections()
                try:
                    own = {**data, 'request_id': data['request_id'] if same else str(uuid.uuid4())}
                    barrier.wait(timeout=10)
                    return str(record_event(user, business.pk, validated(own))[0].pk)
                except Conflict:
                    return 'conflict'
                finally:
                    close_old_connections()
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(execute, [0, 1]))
            self.assertEqual(results[0], results[1]) if same else self.assertEqual(results.count('conflict'), 1)
            self.assertEqual(AttendanceSession.objects.exclude(state='FINISHED').count(), 1)
