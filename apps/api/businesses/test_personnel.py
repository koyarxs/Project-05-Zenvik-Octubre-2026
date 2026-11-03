import uuid
from datetime import timedelta
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from . import test_api as fixtures
from .models import Business, Employee, EmployeeRevision, Membership, Shift
from .leave_services import create_leave, decide_leave


class PersonnelTests(TestCase):
    setUpTestData = classmethod(fixtures.BusinessAPITests.setUpTestData.__func__)
    client_for = fixtures.BusinessAPITests.client_for
    employees_url = fixtures.BusinessAPITests.employees_url

    def access(self, client, employee=None, **data):
        employee = employee or self.own_record
        employee.refresh_from_db()
        return client.patch(self.employees_url(employee=employee) + 'access/', {'expected_updated_at': employee.updated_at.isoformat(), **data}, format='json')

    def test_register_complete_without_account(self):
        response = self.client_for(self.owner).post(self.employees_url(), {'first_name': 'New', 'last_name': 'Person', 'phone': '+56 9 1234 5678', 'job_title': 'Encargado', 'employee_code': 'INT-1', 'work_schedule': 'Distribución acordada', 'admin_notes': 'Nota interna'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data['user'])
        self.assertIsNone(response.data['access_role'])
        self.assertFalse(response.data['access_enabled'])
        self.assertEqual(response.data['job_title'], 'Encargado')
        self.assertEqual(EmployeeRevision.objects.get(employee_id=response.data['id']).actor, self.owner)

    def test_backend_validation(self):
        for data in [{'phone': 'invalid<script>'}, {'job_title': 'a' * 121}, {'employee_code': 'a' * 65}, {'work_schedule': 'a' * 121}, {'admin_notes': 'a' * 1001}, {'hire_date': '2026-02-30'}]:
            response = self.client_for(self.admin).patch(self.employees_url(employee=self.colleague), data, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_code_unique_per_business_but_optional(self):
        self.colleague.employee_code = 'INT-1'
        self.colleague.save()
        client = self.client_for(self.owner)
        self.assertEqual(client.patch(self.employees_url(employee=self.own_record), {'employee_code': 'INT-1'}, format='json').status_code, 400)
        self.foreign_record.employee_code = 'INT-1'
        self.foreign_record.save()
        self.assertEqual(self.foreign_record.employee_code, self.colleague.employee_code)

    def test_job_title_does_not_grant_admin_and_private_notes_hidden(self):
        client = self.client_for(self.owner)
        result = client.patch(self.employees_url(employee=self.own_record), {'job_title': 'OWNER', 'admin_notes': 'Private administrative note'}, format='json')
        self.assertEqual(result.status_code, 200)
        worker = self.client_for(self.worker)
        response = worker.get(self.employees_url(employee=self.own_record))
        self.assertEqual(response.data['access_role'], 'EMPLOYEE')
        self.assertNotIn('admin_notes', response.data)
        self.assertNotIn('admin_notes', worker.get(self.employees_url()).data['results'][0])
        self.assertEqual(worker.get(self.employees_url(employee=self.own_record) + 'history/').status_code, 403)
        self.assertEqual(worker.patch(self.employees_url(employee=self.own_record), {'job_title': 'Other'}, format='json').status_code, 403)

    def test_filters_order_and_catalog_are_scoped(self):
        self.colleague.job_title = 'Cocina'
        self.colleague.save()
        self.foreign_record.job_title = 'Secreto'
        self.foreign_record.save()
        client = self.client_for(self.owner)
        response = client.get(self.employees_url(), {'job_title': 'cocina', 'ordering': 'name'})
        self.assertEqual([row['id'] for row in response.data['results']], [str(self.colleague.pk)])
        catalog = client.get(f'/api/v1/businesses/{self.business.pk}/job-titles/').data['results']
        self.assertEqual(catalog, [{'id': 'Cocina', 'name': 'Cocina'}])
        self.assertEqual(client.get(self.employees_url() + '?ordering=invalid').status_code, 400)
        worker = self.client_for(self.worker)
        self.assertEqual(worker.get(f'/api/v1/businesses/{self.business.pk}/job-titles/').data['results'], [])

    def test_admin_can_edit_but_not_link_or_change_access(self):
        client = self.client_for(self.admin)
        self.assertEqual(client.patch(self.employees_url(employee=self.colleague), {'job_title': 'Cocina', 'phone': '123'}, format='json').status_code, 200)
        self.assertEqual(client.patch(self.employees_url(employee=self.colleague), {'user': str(self.admin.pk)}, format='json').status_code, 403)
        self.assertEqual(self.access(client, role='ADMIN').status_code, 403)
        self.assertEqual(client.get(f'/api/v1/businesses/{self.business.pk}/accounts/').status_code, 403)

    def test_owner_changes_role_and_audits(self):
        response = self.access(self.client_for(self.owner), role='ADMIN')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['access_role'], 'ADMIN')
        revision = self.own_record.revisions.get(action='ACCESS')
        self.assertEqual(revision.actor, self.owner)
        self.assertEqual(revision.snapshot['before']['role'], 'EMPLOYEE')
        self.assertEqual(revision.snapshot['after']['role'], 'ADMIN')
        self.assertEqual(self.access(self.client_for(self.owner), role='EMPLOYEE').status_code, 200)

    def test_owner_role_self_and_foreign_accounts_protected(self):
        client = self.client_for(self.owner)
        self.assertEqual(self.access(client, role='OWNER').status_code, 400)
        self.assertEqual(self.access(client, user=str(self.owner.pk)).status_code, 403)
        for value in (self.other_owner.pk, self.outsider.pk, uuid.uuid4()):
            response = self.access(client, user=str(value))
            self.assertEqual(response.status_code, 400)
            self.assertIn('no está disponible', str(response.data))
        owner_record = Employee.objects.create(business=self.business, user=self.owner, first_name='Owner', last_name='Test')
        self.assertEqual(self.access(client, owner_record, access_enabled=False).status_code, 403)

    def test_suspension_blocks_only_target_business(self):
        Membership.objects.create(user=self.worker, business=self.other, role='EMPLOYEE')
        worker = self.client_for(self.worker)
        self.assertEqual(self.access(self.client_for(self.owner), access_enabled=False).status_code, 200)
        for suffix in ('employees/', 'shifts/', 'leave-requests/', 'dashboard/'):
            self.assertEqual(worker.get(f'/api/v1/businesses/{self.business.pk}/{suffix}').status_code, 404)
        self.assertEqual(worker.get(f'/api/v1/businesses/{self.other.pk}/employees/').status_code, 200)
        businesses = worker.get('/api/v1/businesses/').data['results']
        self.assertNotIn(str(self.business.pk), [row['id'] for row in businesses])
        self.assertEqual(self.access(self.client_for(self.owner), access_enabled=True).status_code, 200)
        self.assertEqual(worker.get(self.employees_url()).status_code, 200)

    def test_binding_existing_member_and_duplicate(self):
        client = self.client_for(self.owner)
        result = self.access(client, self.colleague, user=str(self.admin.pk))
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['account_name'], self.admin.username)
        self.assertEqual(self.access(client, user=str(self.admin.pk)).status_code, 400)
        self.assertEqual(self.access(client, self.colleague, user=None).status_code, 200)

    def test_disabled_member_cannot_write_via_service(self):
        from .services import write_employee
        from django.http import Http404
        member = Membership.objects.get(user=self.admin, business=self.business)
        member.access_enabled = False
        member.save()
        with self.assertRaises(Http404):
            write_employee(self.admin, self.business.pk, {'job_title': 'Unwanted'}, self.colleague.pk)

    def test_access_csrf_unknown_fields_and_foreign_uuid(self):
        client = self.client_for(self.owner)
        client.credentials()
        self.assertEqual(self.access(client, role='ADMIN').status_code, 403)
        client = self.client_for(self.owner)
        self.assertEqual(self.access(client, self.foreign_record, role='ADMIN').status_code, 404)
        self.assertEqual(self.access(client, is_superuser=True).status_code, 400)
        for field in ('access_role', 'access_enabled', 'account_name'):
            self.assertEqual(client.patch(self.employees_url(employee=self.colleague), {field: 'ADMIN'}, format='json').status_code, 400)

    def test_stale_profile_and_access_are_rejected(self):
        client = self.client_for(self.owner)
        version = self.own_record.updated_at.isoformat()
        url = self.employees_url(employee=self.own_record)
        self.assertEqual(client.patch(url, {'job_title': 'Nuevo', 'expected_updated_at': version}, format='json').status_code, 200)
        self.assertEqual(client.patch(url, {'job_title': 'Obsoleto', 'expected_updated_at': version}, format='json').status_code, 400)
        self.assertEqual(client.patch(url + 'access/', {'role': 'ADMIN', 'expected_updated_at': version}, format='json').status_code, 400)

    def test_deactivation_preserves_shifts_and_access_and_blocks_assignment(self):
        start = timezone.now() + timedelta(days=1)
        shift = Shift.objects.create(business=self.business, employee=self.own_record, starts_at=start, ends_at=start + timedelta(hours=4))
        client = self.client_for(self.owner)
        url = self.employees_url(employee=self.own_record)
        self.assertEqual(client.get(url + 'impact/').data['scheduled_count'], 1)
        self.assertEqual(client.patch(url, {'is_active': False}, format='json').status_code, 200)
        shift.refresh_from_db()
        self.assertEqual(shift.status, 'SCHEDULED')
        response = client.post(f'/api/v1/businesses/{self.business.pk}/shifts/', {'employee': str(self.own_record.pk), 'starts_at': (start + timedelta(days=1)).isoformat(), 'ends_at': (start + timedelta(days=1, hours=4)).isoformat()}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client_for(self.worker).get(url).status_code, 200)
        self.assertEqual(self.own_record.revisions.order_by('-id').first().snapshot['is_active'], 'False')

    def test_approved_absence_survives_profile_and_role_change(self):
        start = timezone.now() + timedelta(days=3)
        shift = Shift.objects.create(business=self.business, employee=self.own_record, starts_at=start, ends_at=start + timedelta(hours=4))
        date = start.astimezone(__import__('zoneinfo').ZoneInfo('America/Santiago')).date()
        leave = create_leave(self.worker, self.business.pk, dict(request_type='PERSONAL', start_date=date, end_date=date))
        decide_leave(self.owner, self.business.pk, leave.pk, 'approve')
        self.client_for(self.admin).patch(self.employees_url(employee=self.own_record), {'job_title': 'Cambio'}, format='json')
        self.access(self.client_for(self.owner), role='ADMIN')
        result = self.client_for(self.owner).get(f'/api/v1/businesses/{self.business.pk}/shifts/{shift.pk}/')
        self.assertTrue(result.data['approved_leave_conflict'])
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'APPROVED')

    def test_history_and_impact_do_not_expose_foreign_employee(self):
        client = self.client_for(self.owner)
        for suffix in ('history/', 'impact/'):
            self.assertEqual(client.get(self.employees_url(employee=self.foreign_record) + suffix).status_code, 404)
            self.assertEqual(self.client_for(self.worker).get(self.employees_url(employee=self.colleague) + suffix).status_code in (403, 404), True)

    def test_directory_queries_remain_bounded(self):
        client = self.client_for(self.owner)
        with CaptureQueriesContext(connection) as first:
            self.assertEqual(client.get(self.employees_url()).status_code, 200)
        for index in range(8):
            Employee.objects.create(business=self.business, first_name='Extra', last_name=str(index))
        with CaptureQueriesContext(connection) as many:
            self.assertEqual(client.get(self.employees_url()).data['count'], 10)
        self.assertLessEqual(len(many), len(first) + 1)


class PersonnelMigrationTests(TransactionTestCase):
    def test_preserves_employee_membership_and_history(self):
        from django.db.migrations.executor import MigrationExecutor
        executor = MigrationExecutor(connection)
        previous = [('businesses', '0005_advanced_planning')]
        current = executor.loader.graph.leaf_nodes()  # Restore dependent apps as well.
        executor.migrate(previous)
        try:
            apps = executor.loader.project_state(previous).apps
            business = apps.get_model('businesses', 'Business').objects.create(name='Legacy')
            employee = apps.get_model('businesses', 'Employee').objects.create(business=business, first_name='Legacy', last_name='Worker', is_active=False)
            employee_id = employee.pk
        finally:
            MigrationExecutor(connection).migrate(current)
        saved = Employee.objects.get(pk=employee_id)
        self.assertFalse(saved.is_active)
        self.assertEqual(saved.job_title, '')
        self.assertEqual(saved.phone, '')
        self.assertFalse(saved.revisions.exists())
        saved.job_title = 'Cargo'
        saved.save()
        self.assertEqual(list(saved.revisions.order_by('id').values_list('action', flat=True)), ['BASELINE', 'UPDATE'])


class PersonnelConcurrencyTests(TransactionTestCase):
    def test_only_one_duplicate_code_commits(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections
        from django.core.exceptions import ValidationError
        business = Business.objects.create(name='Concurrent codes')
        barrier = Barrier(2)
        def create(index):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                Employee.objects.create(business_id=business.pk, first_name='Test', last_name=str(index), employee_code='SAME')
                return True
            except ValidationError:
                return False
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(create, range(2)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(Employee.objects.count(), 1)
