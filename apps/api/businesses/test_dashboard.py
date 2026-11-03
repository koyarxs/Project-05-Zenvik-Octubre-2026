import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .leave_services import decide_leave
from .models import Business, Employee, LeaveRequest, Membership, Shift
from .shift_serializers import SANTIAGO


class DashboardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.business = Business.objects.create(name='Summary A')
        cls.other = Business.objects.create(name='Summary B')
        cls.owner = get_user_model().objects.create_user(username='summary-owner', email='summary-owner@example.test')
        cls.worker = get_user_model().objects.create_user(username='summary-worker', email='summary-worker@example.test')
        Membership.objects.create(business=cls.business, user=cls.owner, role='OWNER')
        Membership.objects.create(business=cls.business, user=cls.worker, role='EMPLOYEE')
        cls.person = Employee.objects.create(business=cls.business, user=cls.worker, first_name='Own', last_name='Person')
        cls.colleague = Employee.objects.create(business=cls.business, user=cls.owner, first_name='Other', last_name='Person')
        cls.now = datetime(2026, 10, 31, 9, tzinfo=SANTIAGO)

    def summary(self, user=None, business=None):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            client.force_login(user)
        with patch('businesses.dashboard_views.timezone.now', return_value=self.now):
            return client.get(f'/api/v1/businesses/{business or self.business.pk}/dashboard/')

    def test_empty_summary_and_no_cache(self):
        response = self.summary(self.owner)
        self.assertEqual(response.status_code, 200)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(response.data['today_count'], 0)
        self.assertEqual(response.data['today_shifts'], [])
        self.assertEqual(response.data['pending_requests'], [])
        self.assertEqual(len(response.data['days']), 7)
        self.assertEqual(response.data['active_employees'], 2)

    def test_counts_previews_overnight_and_worker_scope(self):
        for i in range(8):
            person = Employee.objects.create(business=self.business, first_name=f'Worker {i}', last_name='Test')
            Shift.objects.create(business=self.business, employee=person, starts_at=self.now, ends_at=self.now + timedelta(hours=4))
        own = Shift.objects.create(business=self.business, employee=self.person, starts_at=self.now - timedelta(hours=10), ends_at=self.now + timedelta(hours=1))
        LeaveRequest.objects.create(business=self.business, employee=self.person, requested_by=self.worker, request_type='PERSONAL', start_date='2026-11-03', end_date='2026-11-03', reason='Private reason')
        LeaveRequest.objects.create(business=self.business, employee=self.colleague, requested_by=self.owner, request_type='PERSONAL', start_date='2026-11-03', end_date='2026-11-03')
        manager = self.summary(self.owner).data
        self.assertEqual(manager['today_count'], 9)
        self.assertEqual(manager['week_count'], 9)
        self.assertEqual(len(manager['today_shifts']), 6)
        self.assertEqual(len(manager['upcoming_shifts']), 6)
        self.assertEqual(manager['days'][0]['count'], 9)
        self.assertEqual(manager['pending_count'], 2)
        self.assertNotIn('reason', manager['pending_requests'][0])
        worker = self.summary(self.worker).data
        self.assertIsNone(worker['active_employees'])
        self.assertEqual(worker['today_count'], 1)
        self.assertEqual([row['id'] for row in worker['today_shifts']], [str(own.pk)])
        self.assertEqual(worker['pending_count'], 1)

    def test_admin_and_bounded_pending_preview(self):
        Membership.objects.filter(user=self.owner).update(role='ADMIN')
        for day in range(1, 7):
            LeaveRequest.objects.create(business=self.business, employee=self.person, requested_by=self.worker, request_type='PERSONAL', start_date=f'2026-12-{day:02}', end_date=f'2026-12-{day:02}')
        response = self.summary(self.owner)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['active_employees'], 2)
        self.assertEqual(response.data['pending_count'], 6)
        self.assertEqual(len(response.data['pending_requests']), 4)

    def test_summary_is_read_only(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.owner)
        token = client.get('/api/v1/auth/csrf/').data['csrfToken']
        response = client.post(f'/api/v1/businesses/{self.business.pk}/dashboard/', {}, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 405)

    def test_worker_next_shift_beyond_week_and_private_profile(self):
        start = self.now + timedelta(days=20)
        own = Shift.objects.create(business=self.business, employee=self.person, starts_at=start, ends_at=start + timedelta(hours=8))
        Shift.objects.create(business=self.business, employee=self.colleague, starts_at=self.now, ends_at=self.now + timedelta(hours=2))
        Employee.objects.filter(pk=self.person.pk).update(admin_notes='Confidential', job_title='Operador')
        data = self.summary(self.worker).data
        self.assertEqual(data['next_shift']['id'], str(own.pk))
        self.assertEqual(data['upcoming_shifts'], [])
        self.assertEqual(data['worker_profile']['job_title'], 'Operador')
        self.assertNotIn('admin_notes', data['worker_profile'])
        self.assertNotIn('Confidential', str(data))
        self.assertEqual(data['timezone'], 'America/Santiago')

    def test_worker_request_counts_all_states_exclude_peers(self):
        for index, status in enumerate(LeaveRequest.Status.values):
            leave = LeaveRequest.objects.create(business=self.business, employee=self.person, requested_by=self.worker, request_type='PERSONAL', start_date=f'2026-12-{index+1:02}', end_date=f'2026-12-{index+1:02}')
            if status != 'PENDING':
                action = {'APPROVED': 'approve', 'REJECTED': 'reject', 'CANCELLED': 'cancel'}[status]
                decide_leave(self.worker if action == 'cancel' else self.owner, self.business.pk, leave.pk, action)
        LeaveRequest.objects.create(business=self.business, employee=self.colleague, requested_by=self.owner, request_type='PERSONAL', start_date='2026-12-10', end_date='2026-12-10', reason='Peer secret')
        data = self.summary(self.worker).data
        self.assertEqual(data['request_counts'], dict.fromkeys(LeaveRequest.Status.values, 1))
        self.assertNotIn('Peer secret', str(data))

    def test_missing_inactive_and_disabled_worker(self):
        Employee.objects.filter(pk=self.person.pk).update(is_active=False)
        self.assertFalse(self.summary(self.worker).data['worker_profile']['is_active'])
        Employee.objects.filter(pk=self.person.pk).update(user=None)
        data = self.summary(self.worker).data
        self.assertIsNone(data['worker_profile'])
        self.assertIsNone(data['next_shift'])
        Membership.objects.filter(user=self.worker).update(access_enabled=False)
        self.assertEqual(self.summary(self.worker).status_code, 404)

    def test_preview_queries_do_not_grow_per_employee(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        Shift.objects.create(business=self.business, employee=self.person, starts_at=self.now, ends_at=self.now + timedelta(hours=1))
        with CaptureQueriesContext(connection) as first:
            self.summary(self.owner)
        for index in range(5):
            person = Employee.objects.create(business=self.business, first_name=f'Query {index}', last_name='Test')
            Shift.objects.create(business=self.business, employee=person, starts_at=self.now, ends_at=self.now + timedelta(hours=1))
        with CaptureQueriesContext(connection) as many:
            self.summary(self.owner)
        self.assertEqual(len(first), len(many))

    def test_boundary_cancelled_and_foreign_data_excluded(self):
        for start, status in ((self.now.replace(hour=0) - timedelta(hours=2), 'SCHEDULED'), (self.now, 'CANCELLED'), (self.now.replace(hour=0) + timedelta(days=7), 'SCHEDULED')):
            Shift.objects.create(business=self.business, employee=self.person, starts_at=start, ends_at=start + timedelta(hours=2), status=status)
        foreign = Employee.objects.create(business=self.other, first_name='Foreign', last_name='Person')
        Shift.objects.create(business=self.other, employee=foreign, starts_at=self.now, ends_at=self.now + timedelta(hours=2))
        self.assertEqual(self.summary(self.owner).data['week_count'], 0)

    def test_anonymous_foreign_unknown_revoked_and_inactive(self):
        self.assertEqual(self.summary().status_code, 403)
        foreign = self.summary(self.owner, self.other.pk)
        unknown = self.summary(self.owner, uuid.uuid4())
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(foreign.data, unknown.data)
        Membership.objects.filter(user=self.worker).update(is_active=False)
        self.assertEqual(self.summary(self.worker).status_code, 404)
        Business.objects.filter(pk=self.business.pk).update(is_active=False)
        self.assertEqual(self.summary(self.owner).status_code, 404)
