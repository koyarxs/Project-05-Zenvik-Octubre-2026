import uuid
from datetime import timedelta
from django.test import TestCase
from . import test_shifts as fixtures
from .models import Shift, ShiftRevision, PlanningOperation
from .leave_services import create_leave, decide_leave


class PlanningTests(TestCase):
    setUpTestData = classmethod(fixtures.ShiftAPITests.setUpTestData.__func__)
    client_for = fixtures.ShiftAPITests.client_for
    url = fixtures.ShiftAPITests.url
    payload = fixtures.ShiftAPITests.payload
    create = fixtures.ShiftAPITests.create

    def endpoint(self, suffix):
        return f'/api/v1/businesses/{self.business.pk}/{suffix}/'

    def approved(self):
        leave = create_leave(self.worker, self.business.pk, dict(request_type='PERSONAL', start_date='2026-10-26', end_date='2026-10-26'))
        return decide_leave(self.owner, self.business.pk, leave.pk, 'approve')

    def test_break_excluded_and_notes(self):
        response = self.client_for(self.owner).post(self.url(), self.payload(break_minutes=30, break_included=False, notes='Cierre'), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['planned_minutes'], 450)
        self.assertEqual(response.data['notes'], 'Cierre')

    def test_break_included(self):
        response = self.client_for(self.owner).post(self.url(), self.payload(break_minutes=30, break_included=True), format='json')
        self.assertEqual(response.data['planned_minutes'], 480)

    def test_invalid_break_and_notes(self):
        for data in [dict(break_minutes=-1), dict(break_minutes=480), dict(break_minutes=900), dict(notes='a' * 1001)]:
            self.assertEqual(self.client_for(self.owner).post(self.url(), self.payload(**data), format='json').status_code, 400)
        self.assertEqual(Shift.objects.count(), 0)

    def test_configurable_duration(self):
        client = self.client_for(self.owner)
        response = client.patch(self.endpoint('planning-settings'), {'planning_max_minutes': 300}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 400)
        client.patch(self.endpoint('planning-settings'), {'planning_max_minutes': None}, format='json')
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 201)

    def test_settings_roles_and_unknown_fields(self):
        for user in (self.worker, self.outsider):
            self.assertIn(self.client_for(user).patch(self.endpoint('planning-settings'), {'planning_block_leave': False}, format='json').status_code, (403, 404))
        self.assertEqual(self.client_for(self.owner).patch(self.endpoint('planning-settings'), {'planning_timezone': 'UTC'}, format='json').status_code, 400)
        self.assertEqual(self.client_for(self.worker).get(self.endpoint('planning-settings')).status_code, 200)

    def test_approved_leave_blocks_assignment(self):
        self.approved()
        response = self.client_for(self.owner).post(self.url(), self.payload(), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('permiso aprobado', str(response.data))

    def test_warning_policy_and_conflict_visibility(self):
        self.approved()
        self.business.planning_block_leave = False
        self.business.save()
        response = self.client_for(self.owner).post(self.url(), self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['approved_leave_conflict'])
        result = self.client_for(self.worker).get(self.url() + '?date_from=2026-10-26&date_to=2026-11-02')
        self.assertTrue(result.data['results'][0]['approved_leave_conflict'])

    def test_approval_preserves_shift_and_cancellation_resolves(self):
        shift = self.create()
        self.approved()
        shift.refresh_from_db()
        self.assertEqual(shift.status, 'SCHEDULED')
        self.assertEqual(self.client_for(self.owner).delete(self.url(shift)).status_code, 204)
        self.assertFalse(self.client_for(self.owner).get(self.url(shift)).data['approved_leave_conflict'])

    def test_leave_boundary_and_overnight(self):
        self.approved()
        # Ends exactly at the start of approved leave: allowed.
        data = self.payload(starts_at='2026-10-25T20:00:00-03:00', ends_at='2026-10-26T00:00:00-03:00')
        self.assertEqual(self.client_for(self.owner).post(self.url(), data, format='json').status_code, 201)
        data = self.payload(starts_at='2026-10-25T23:00:00-03:00', ends_at='2026-10-26T02:00:00-03:00')
        self.assertEqual(self.client_for(self.owner).post(self.url(), data, format='json').status_code, 400)

    def test_single_retry_is_idempotent(self):
        client = self.client_for(self.owner)
        data = self.payload(request_id=str(uuid.uuid4()))
        first = client.post(self.url(), data, format='json')
        second = client.post(self.url(), data, format='json')
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Shift.objects.count(), 1)
        self.assertEqual(ShiftRevision.objects.count(), 1)
        self.assertEqual(client.post(self.url(), {**data, 'notes': 'changed'}, format='json').status_code, 400)

    def test_batch_atomicity(self):
        client = self.client_for(self.owner)
        data = {'request_id': str(uuid.uuid4()), 'shifts': [self.payload(), self.payload()]}
        response = client.post(self.url() + 'batch/', data, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Shift.objects.count(), 0)
        self.assertEqual(ShiftRevision.objects.count(), 0)
        self.assertEqual(PlanningOperation.objects.count(), 0)

    def test_batch_retry_and_different_employees(self):
        client = self.client_for(self.owner)
        data = {'request_id': str(uuid.uuid4()), 'shifts': [self.payload(), self.payload(employee=str(self.colleague.pk))]}
        for _ in range(2):
            response = client.post(self.url() + 'batch/', data, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Shift.objects.count(), 2)

    def test_batch_roles_tenancy_and_limits(self):
        data = {'request_id': str(uuid.uuid4()), 'shifts': [self.payload()]}
        self.assertEqual(self.client_for(self.worker).post(self.url() + 'batch/', data, format='json').status_code, 403)
        data['shifts'] = [self.payload(employee=str(self.foreign.pk))]
        self.assertEqual(self.client_for(self.owner).post(self.url() + 'batch/', data, format='json').status_code, 400)
        data['shifts'] = [self.payload()] * 101
        self.assertEqual(self.client_for(self.owner).post(self.url() + 'batch/', data, format='json').status_code, 400)
        self.assertEqual(Shift.objects.count(), 0)

    def test_stale_edit_and_audit(self):
        shift = self.create()
        client = self.client_for(self.owner)
        original = client.get(self.url(shift)).data
        self.assertEqual(client.patch(self.url(shift), {'notes': 'First', 'expected_updated_at': original['updated_at']}, format='json').status_code, 200)
        self.assertEqual(client.patch(self.url(shift), {'notes': 'Stale', 'expected_updated_at': original['updated_at']}, format='json').status_code, 400)
        rows = client.get(self.url(shift) + 'history/').data['results']
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['snapshot']['notes'], 'First')
        self.assertEqual(ShiftRevision.objects.filter(actor=self.owner).count(), 1)
        self.assertEqual(self.client_for(self.worker).get(self.url(shift) + 'history/').status_code, 403)

    def test_cancelled_notes_immutable(self):
        shift = self.create()
        client = self.client_for(self.owner)
        client.delete(self.url(shift))
        self.assertEqual(client.patch(self.url(shift), {'notes': 'changed'}, format='json').status_code, 400)

    def test_month_range(self):
        self.create()
        result = self.client_for(self.owner).get(self.url() + '?date_from=2026-10-01&date_to=2026-11-01')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['count'], 1)


    def test_pending_leave_does_not_block_or_get_approved(self):
        leave = create_leave(self.worker, self.business.pk, dict(request_type='PERSONAL', start_date='2026-10-26', end_date='2026-10-26'))
        response = self.client_for(self.owner).post(self.url(), self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'PENDING')

    def test_bulk_csrf_and_reused_key_rejection(self):
        client = self.client_for(self.owner)
        data = {'request_id': str(uuid.uuid4()), 'shifts': [self.payload()]}
        client.credentials()
        self.assertEqual(client.post(self.url() + 'batch/', data, format='json').status_code, 403)
        client = self.client_for(self.owner)
        self.assertEqual(client.post(self.url() + 'batch/', data, format='json').status_code, 201)
        data['shifts'][0]['notes'] = 'Different operation'
        self.assertEqual(client.post(self.url() + 'batch/', data, format='json').status_code, 400)
        self.assertEqual(Shift.objects.count(), 1)

    def test_list_queries_do_not_grow_per_shift(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        client = self.client_for(self.owner)
        self.create()
        url = self.url() + '?date_from=2026-10-01&date_to=2026-11-01'
        with CaptureQueriesContext(connection) as first:
            self.assertEqual(client.get(url).status_code, 200)
        for day in range(1, 10):
            self.create(start=fixtures.START - timedelta(days=day))
        with CaptureQueriesContext(connection) as many:
            self.assertEqual(client.get(url).data['count'], 10)
        self.assertLessEqual(len(many), len(first) + 1)


class PlanningConcurrencyTests(fixtures.TransactionTestCase):
    def test_concurrent_batch_retry_commits_once(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections
        from .models import Business, Employee, Membership
        from .shift_services import write_shift_batch
        from django.contrib.auth import get_user_model
        business = Business.objects.create(name='Concurrent batch')
        owner = get_user_model().objects.create_user(username='batch-owner')
        Membership.objects.create(user=owner, business=business, role='OWNER')
        employee = Employee.objects.create(business=business, first_name='Batch', last_name='Test')
        barrier = Barrier(2)
        key = uuid.uuid4()
        data = [dict(employee_id=employee.pk, starts_at=fixtures.START, ends_at=fixtures.START + timedelta(hours=8))]
        def create(_):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return str(write_shift_batch(owner, business.pk, data, key)[0].pk)
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(create, range(2)))
        self.assertEqual(results[0], results[1])
        self.assertEqual(Shift.objects.count(), 1)
        self.assertEqual(ShiftRevision.objects.count(), 1)
        self.assertEqual(PlanningOperation.objects.count(), 1)


class PlanningMigrationTests(fixtures.TransactionTestCase):
    def test_existing_shift_survives_additive_migration(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        executor = MigrationExecutor(connection)
        previous = [('businesses', '0004_leave_requests')]
        current = executor.loader.graph.leaf_nodes()  # Restore dependent apps as well.
        executor.migrate(previous)
        try:
            apps = executor.loader.project_state(previous).apps
            business = apps.get_model('businesses', 'Business').objects.create(name='Existing business')
            employee = apps.get_model('businesses', 'Employee').objects.create(business=business, first_name='Existing', last_name='Test')
            shift = apps.get_model('businesses', 'Shift').objects.create(business=business, employee=employee, starts_at=fixtures.START, ends_at=fixtures.START + timedelta(hours=8))
            shift_id = shift.pk
        finally:
            MigrationExecutor(connection).migrate(current)
        saved = Shift.objects.get(pk=shift_id)
        self.assertEqual(saved.starts_at, fixtures.START)
        self.assertEqual(saved.status, 'SCHEDULED')
        self.assertEqual(saved.break_minutes, 0)
        self.assertTrue(saved.break_included)
        self.assertEqual(saved.notes, '')
        self.assertFalse(saved.revisions.exists())
        saved.notes = 'Updated after migration'
        saved.save()
        self.assertEqual(list(saved.revisions.order_by('id').values_list('action', flat=True)), ['BASELINE', 'UPDATE'])
