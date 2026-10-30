from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from threading import Barrier

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, close_old_connections, transaction
from django.test import TestCase, TransactionTestCase
from rest_framework.exceptions import ValidationError as APIValidationError
from rest_framework.test import APIClient

from .leave_services import create_leave, decide_leave
from .models import Business, Employee, LeaveRequest, Membership, Shift


class LeaveAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.business = Business.objects.create(name='Leave A')
        cls.other = Business.objects.create(name='Leave B')
        for name, role in [('owner', 'OWNER'), ('admin', 'ADMIN'), ('worker', 'EMPLOYEE'), ('colleague', 'EMPLOYEE')]:
            user = get_user_model().objects.create_user(username=name, email=f'{name}@example.com')
            setattr(cls, name, user)
            Membership.objects.create(business=cls.business, user=user, role=role)
        cls.employee = Employee.objects.create(business=cls.business, user=cls.worker, first_name='Leave', last_name='Worker')
        cls.peer = Employee.objects.create(business=cls.business, user=cls.colleague, first_name='Peer', last_name='Worker')
        cls.foreign = Employee.objects.create(business=cls.other, first_name='Foreign', last_name='Worker')

    def client_for(self, user=None, csrf=True):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            client.force_login(user)
        if csrf:
            client.credentials(HTTP_X_CSRFTOKEN=client.get('/api/v1/auth/csrf/').data['csrfToken'])
        return client

    def url(self, leave=None, action='', business=None):
        base = f'/api/v1/businesses/{(business or self.business).pk}/leave-requests/'
        return base + (f'{leave.pk}/' if leave else '') + (f'{action}/' if action else '')

    def data(self, **kwargs):
        return {'request_type': 'PERSONAL', 'start_date': '2026-10-26', 'end_date': '2026-10-27', 'reason': 'Motivo de prueba', **kwargs}

    def leave(self, user=None, **kwargs):
        return create_leave(user or self.worker, self.business.pk, self.data(**kwargs))

    def test_create_own_and_server_identity(self):
        response = self.client_for(self.worker).post(self.url(), self.data(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        obj = LeaveRequest.objects.get()
        self.assertEqual(obj.employee, self.employee)
        self.assertEqual(obj.requested_by, self.worker)
        self.assertTrue(response.data['can_cancel'])
        self.assertFalse(response.data['can_review'])
        self.assertNotIn('email', response.data)

    def test_invalid_dates_and_types(self):
        for data in (self.data(end_date='2026-10-25'), self.data(start_date='bad'), self.data(end_date='9999-12-31'), self.data(request_type='VACATION'), self.data(reason='x' * 1001)):
            self.assertEqual(self.client_for(self.worker).post(self.url(), data, format='json').status_code, 400)

    def test_sensitive_or_unknown_fields_rejected(self):
        for field in ('employee', 'business', 'requested_by', 'status', 'reviewed_by', 'reviewed_at', 'review_note', 'role'):
            response = self.client_for(self.worker).post(self.url(), self.data(**{field: 'invalid'}), format='json')
            self.assertEqual(response.status_code, 400, field)
        self.assertFalse(LeaveRequest.objects.exists())

    def test_inactive_or_missing_employee_cannot_create(self):
        self.employee.is_active = False
        self.employee.save()
        for user in (self.worker, self.owner):
            self.assertEqual(self.client_for(user).post(self.url(), self.data(), format='json').status_code, 400)

    def test_only_own_list_and_detail(self):
        own = self.leave()
        peer = self.leave(self.colleague)
        client = self.client_for(self.worker)
        self.assertEqual([x['id'] for x in client.get(self.url()).data['results']], [str(own.pk)])
        self.assertEqual(client.get(self.url(peer)).status_code, 404)
        for action in ('approve', 'reject', 'cancel'):
            self.assertEqual(client.post(self.url(peer, action), {}, format='json').status_code, 404)
        self.assertEqual(self.client_for(self.admin).get(self.url()).data['count'], 2)

    def test_foreign_business_and_uuid(self):
        leave = self.leave()
        for user in (self.owner, self.admin, self.worker):
            client = self.client_for(user)
            self.assertEqual(client.get(self.url(business=self.other)).status_code, 404)
            self.assertEqual(client.get(self.url(leave, business=self.other)).status_code, 404)
            self.assertEqual(client.post(self.url(leave, 'approve', self.other), {}, format='json').status_code, 404)

    def test_owner_approves_with_audit(self):
        leave = self.leave()
        response = self.client_for(self.owner).post(self.url(leave, 'approve'), {'review_note': 'Acordado'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'APPROVED')
        self.assertEqual(leave.reviewed_by, self.owner)
        self.assertIsNotNone(leave.reviewed_at)
        self.assertEqual(leave.review_note, 'Acordado')

    def test_admin_rejects_with_audit(self):
        leave = self.leave()
        response = self.client_for(self.admin).post(self.url(leave, 'reject'), {}, format='json')
        self.assertEqual(response.status_code, 200)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'REJECTED')
        self.assertEqual(leave.reviewed_by, self.admin)

    def test_worker_cancels_pending_and_preserves_history(self):
        leave = self.leave()
        self.assertEqual(self.client_for(self.worker).post(self.url(leave, 'cancel'), {}, format='json').status_code, 200)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'CANCELLED')
        self.assertIsNone(leave.reviewed_by)
        self.assertEqual(LeaveRequest.objects.count(), 1)

    def test_no_manager_cancel_of_others(self):
        leave = self.leave()
        self.assertEqual(self.client_for(self.owner).post(self.url(leave, 'cancel'), {}, format='json').status_code, 403)

    def test_worker_cannot_review_even_own(self):
        leave = self.leave()
        for action in ('approve', 'reject'):
            self.assertEqual(self.client_for(self.worker).post(self.url(leave, action), {}, format='json').status_code, 403)

    def test_manager_cannot_self_review(self):
        Employee.objects.create(business=self.business, user=self.owner, first_name='Owner', last_name='Worker')
        leave = self.leave(self.owner)
        for action in ('approve', 'reject'):
            self.assertEqual(self.client_for(self.owner).post(self.url(leave, action), {}, format='json').status_code, 403)
        self.assertEqual(self.client_for(self.admin).post(self.url(leave, 'approve'), {}, format='json').status_code, 200)

    def test_terminal_transitions_all_rejected(self):
        for index, action in enumerate(('approve', 'reject', 'cancel')):
            leave = self.leave(start_date=f'2026-11-{10+index}', end_date=f'2026-11-{10+index}')
            actor = self.worker if action == 'cancel' else self.owner
            self.assertEqual(self.client_for(actor).post(self.url(leave, action), {}, format='json').status_code, 200)
            for next_action in ('approve', 'reject', 'cancel'):
                next_actor = self.worker if next_action == 'cancel' else self.owner
                self.assertEqual(self.client_for(next_actor).post(self.url(leave, next_action), {}, format='json').status_code, 400)

    def test_review_payload_cannot_spoof_audit(self):
        leave = self.leave()
        for field in ('reviewed_by', 'reviewed_at', 'status', 'employee'):
            self.assertEqual(self.client_for(self.owner).post(self.url(leave, 'approve'), {field: 'spoof'}, format='json').status_code, 400)
        self.assertEqual(self.client_for(self.worker).post(self.url(leave, 'cancel'), {'review_note': 'spoof'}, format='json').status_code, 400)

    def test_no_patch_or_delete(self):
        leave = self.leave()
        client = self.client_for(self.owner)
        self.assertEqual(client.patch(self.url(leave), {'status': 'APPROVED'}, format='json').status_code, 405)
        self.assertEqual(client.delete(self.url(leave)).status_code, 405)
        with self.assertRaises(ValidationError):
            LeaveRequest.objects.filter(pk=leave.pk).delete()

    def test_overlap_inclusive_pending_and_approved(self):
        leave = self.leave()
        for action in (None, 'approve'):
            if action:
                decide_leave(self.owner, self.business.pk, leave.pk, action)
            for start, end in [('2026-10-25', '2026-10-26'), ('2026-10-27', '2026-10-28'), ('2026-10-26', '2026-10-26')]:
                self.assertEqual(self.client_for(self.worker).post(self.url(), self.data(start_date=start, end_date=end), format='json').status_code, 400)
        self.assertEqual(self.client_for(self.worker).post(self.url(), self.data(start_date='2026-10-28', end_date='2026-10-28'), format='json').status_code, 201)

    def test_rejection_and_cancellation_release_dates(self):
        for action in ('reject', 'cancel'):
            leave = self.leave()
            decide_leave(self.worker if action == 'cancel' else self.owner, self.business.pk, leave.pk, action)
        self.assertEqual(self.client_for(self.worker).post(self.url(), self.data(), format='json').status_code, 201)

    def test_filters_status_dates_and_pagination(self):
        leave = self.leave()
        self.leave(self.colleague, start_date='2026-12-01', end_date='2026-12-01')
        decide_leave(self.owner, self.business.pk, leave.pk, 'approve')
        client = self.client_for(self.owner)
        response = client.get(self.url() + '?status=APPROVED&date_from=2026-10-27&date_to=2026-10-27')
        self.assertEqual(response.data['count'], 1)
        self.assertIn('next', response.data)
        self.assertEqual(client.get(self.url() + '?date_from=2026-12-02').data['count'], 0)
        for query in ('status=BAD', 'date_from=bad', 'date_from=2026-12-01&date_to=2026-01-01'):
            self.assertEqual(client.get(self.url() + '?' + query).status_code, 400)

    def test_csrf_and_anonymous(self):
        leave = self.leave()
        self.assertEqual(self.client_for().get(self.url()).status_code, 403)
        self.assertEqual(self.client_for().post(self.url(), self.data(), format='json').status_code, 403)
        self.assertEqual(self.client_for(self.worker, csrf=False).post(self.url(), self.data(), format='json').status_code, 403)
        for action in ('approve', 'reject', 'cancel'):
            self.assertEqual(self.client_for(self.owner, csrf=False).post(self.url(leave, action), {}, format='json').status_code, 403)

    def test_inactive_membership_or_business(self):
        leave = self.leave()
        membership = Membership.objects.get(user=self.admin, business=self.business)
        membership.is_active = False
        membership.save()
        self.assertEqual(self.client_for(self.admin).get(self.url()).status_code, 404)
        self.assertEqual(self.client_for(self.admin).post(self.url(leave, 'approve'), {}, format='json').status_code, 404)
        self.business.is_active = False
        self.business.save()
        self.assertEqual(self.client_for(self.worker).post(self.url(), self.data(), format='json').status_code, 404)

    def test_overnight_affected_shifts_and_no_mutation(self):
        leave = self.leave(start_date='2026-10-27', end_date='2026-10-27')
        start = datetime(2026, 10, 27, 1, tzinfo=timezone.utc)  # 26th 22:00 Santiago
        shift = Shift.objects.create(business=self.business, employee=self.employee, starts_at=start, ends_at=start + timedelta(hours=8))
        Shift.objects.create(business=self.business, employee=self.peer, starts_at=start, ends_at=start + timedelta(hours=8))
        response = self.client_for(self.owner).get(self.url(leave))
        self.assertEqual(response.data['affected_shifts']['count'], 1)
        response = self.client_for(self.owner).post(self.url(leave, 'approve'), {}, format='json')
        self.assertEqual(response.data['affected_shifts']['count'], 1)
        shift.refresh_from_db()
        self.assertEqual(shift.status, 'SCHEDULED')
        self.assertEqual(shift.starts_at, start)

    def test_cancelled_shift_and_midnight_boundary_excluded(self):
        leave = self.leave(start_date='2026-10-27', end_date='2026-10-27')
        start = datetime(2026, 10, 27, 1, tzinfo=timezone.utc)
        Shift.objects.create(business=self.business, employee=self.employee, starts_at=start, ends_at=start + timedelta(hours=2))
        Shift.objects.create(business=self.business, employee=self.employee, starts_at=start + timedelta(hours=3), ends_at=start + timedelta(hours=4), status='CANCELLED')
        self.assertEqual(self.client_for(self.owner).get(self.url(leave)).data['affected_shifts']['count'], 0)

    def test_requester_history_does_not_transfer_on_unlink(self):
        leave = self.leave()
        self.employee.user = None
        self.employee.save()
        self.assertEqual(self.client_for(self.worker).get(self.url(leave)).status_code, 200)
        self.assertEqual(self.client_for(self.colleague).get(self.url(leave)).status_code, 404)
        self.assertFalse(self.client_for(self.worker).get(self.url(leave)).data['affected_shifts']['visible'])

    def test_dst_day_uses_local_calendar_boundaries(self):
        leave = self.leave(start_date='2026-09-06', end_date='2026-09-06')
        start = datetime(2026, 9, 6, 4, tzinfo=timezone.utc)
        Shift.objects.create(business=self.business, employee=self.employee, starts_at=start, ends_at=start + timedelta(hours=23))
        Shift.objects.create(business=self.business, employee=self.employee, starts_at=start + timedelta(hours=23), ends_at=start + timedelta(hours=24))
        self.assertEqual(self.client_for(self.owner).get(self.url(leave)).data['affected_shifts']['count'], 1)

    def test_model_original_and_terminal_fields_immutable(self):
        leave = self.leave()
        leave.reason = 'Changed'
        with self.assertRaises(ValidationError):
            leave.save()
        leave.refresh_from_db()
        decide_leave(self.owner, self.business.pk, leave.pk, 'approve')
        leave.refresh_from_db()
        leave.review_note = 'Rewrite'
        with self.assertRaises(ValidationError):
            leave.save()

    def test_database_constraints(self):
        for values in ({'status': 'INVALID'}, {'end_date': date(2026, 1, 1)}, {'status': 'APPROVED'}, {'request_type': 'INVALID'}):
            fields = dict(business=self.business, employee=self.employee, requested_by=self.worker, request_type='OTHER', start_date=date(2026, 10, 26), end_date=date(2026, 10, 27))
            fields.update(values)
            with self.assertRaises(IntegrityError), transaction.atomic():
                LeaveRequest.objects.bulk_create([LeaveRequest(**fields)])


class LeaveConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.business = Business.objects.create(name='Concurrent leave')
        self.worker = get_user_model().objects.create_user(username='worker', email='worker@example.com')
        self.owner = get_user_model().objects.create_user(username='owner', email='owner@example.com')
        Membership.objects.create(user=self.worker, business=self.business, role='EMPLOYEE')
        Membership.objects.create(user=self.owner, business=self.business, role='OWNER')
        Employee.objects.create(user=self.worker, business=self.business, first_name='Concurrent', last_name='Worker')

    def race(self, operation):
        barrier = Barrier(2)
        def run(index):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                operation(index)
                return True
            except (ValidationError, APIValidationError):
                return False
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as executor:
            return list(executor.map(run, range(2)))

    def data(self):
        return dict(request_type='OTHER', start_date=date(2026, 10, 26), end_date=date(2026, 10, 26))

    def test_concurrent_overlap_only_one_commits(self):
        results = self.race(lambda _: create_leave(self.worker, self.business.pk, self.data()))
        self.assertEqual(sum(results), 1)
        self.assertEqual(LeaveRequest.objects.count(), 1)

    def test_concurrent_decisions_only_one_commits(self):
        leave = create_leave(self.worker, self.business.pk, self.data())
        results = self.race(lambda i: decide_leave(self.owner, self.business.pk, leave.pk, ['approve', 'reject'][i]))
        self.assertEqual(sum(results), 1)
        leave.refresh_from_db()
        self.assertIn(leave.status, ['APPROVED', 'REJECTED'])

    def test_concurrent_cancel_approve_only_one_commits(self):
        leave = create_leave(self.worker, self.business.pk, self.data())
        results = self.race(lambda i: decide_leave([self.worker, self.owner][i], self.business.pk, leave.pk, ['cancel', 'approve'][i]))
        self.assertEqual(sum(results), 1)
