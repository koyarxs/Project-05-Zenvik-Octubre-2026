import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, close_old_connections, transaction
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from .models import Business, Employee, Membership, Shift

START = datetime(2026, 10, 26, 12, tzinfo=timezone.utc)  # 09:00 Santiago


class ShiftAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.business = Business.objects.create(name='Shift test A')
        cls.other = Business.objects.create(name='Shift test B')
        cls.owner = get_user_model().objects.create_user(username='shift-owner', email='owner-shift@example.com')
        cls.admin = get_user_model().objects.create_user(username='shift-admin', email='admin-shift@example.com')
        cls.worker = get_user_model().objects.create_user(username='shift-worker', email='worker-shift@example.com')
        cls.outsider = get_user_model().objects.create_user(username='shift-outside', email='outside-shift@example.com')
        for user, role in ((cls.owner, 'OWNER'), (cls.admin, 'ADMIN'), (cls.worker, 'EMPLOYEE')):
            Membership.objects.create(business=cls.business, user=user, role=role)
        cls.employee = Employee.objects.create(business=cls.business, user=cls.worker, first_name='Ana', last_name='Test')
        cls.colleague = Employee.objects.create(business=cls.business, first_name='Other', last_name='Test')
        cls.foreign = Employee.objects.create(business=cls.other, first_name='Foreign', last_name='Test')

    def client_for(self, user):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            client.force_login(user)
        token = client.get('/api/v1/auth/csrf/').data['csrfToken']
        client.credentials(HTTP_X_CSRFTOKEN=token)
        return client

    def url(self, shift=None, business=None):
        base = f'/api/v1/businesses/{(business or self.business).pk}/shifts/'
        return base + f'{shift.pk}/' if shift else base

    def payload(self, **kwargs):
        return {'employee': str(self.employee.pk), 'starts_at': START.isoformat(), 'ends_at': (START + timedelta(hours=8)).isoformat(), **kwargs}

    def create(self, employee=None, start=START, end=None, **kwargs):
        return Shift.objects.create(business=self.business, employee=employee or self.employee, starts_at=start, ends_at=end or start + timedelta(hours=8), **kwargs)

    def test_owner_creation_and_no_unnecessary_personal_data(self):
        response = self.client_for(self.owner).post(self.url(), self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['employee_name'], 'Ana Test')
        self.assertNotIn('email', response.data)
        self.assertNotIn('user', response.data)
        self.assertEqual(response.data['status'], 'SCHEDULED')

    def test_admin_creation(self):
        self.assertEqual(self.client_for(self.admin).post(self.url(), self.payload(), format='json').status_code, 201)

    def test_rejects_equal_or_reversed_times(self):
        for end in (START, START - timedelta(minutes=1)):
            response = self.client_for(self.owner).post(self.url(), self.payload(ends_at=end.isoformat()), format='json')
            self.assertEqual(response.status_code, 400)
        self.assertFalse(Shift.objects.exists())

    def test_overlap_all_shapes_rejected(self):
        self.create()
        for start, end in ((START, START + timedelta(hours=8)), (START - timedelta(hours=1), START + timedelta(hours=1)), (START + timedelta(hours=7), START + timedelta(hours=9)), (START + timedelta(hours=1), START + timedelta(hours=2)), (START - timedelta(hours=1), START + timedelta(hours=9))):
            with self.subTest(start=start, end=end):
                response = self.client_for(self.owner).post(self.url(), self.payload(starts_at=start.isoformat(), ends_at=end.isoformat()), format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn('superpone', str(response.data))

    def test_adjacent_shifts_allowed(self):
        self.create()
        self.create(start=START + timedelta(hours=8))
        self.assertEqual(Shift.objects.count(), 2)

    def test_different_employees_same_time_allowed(self):
        self.create()
        self.create(employee=self.colleague)
        self.assertEqual(Shift.objects.count(), 2)

    def test_overnight(self):
        response = self.client_for(self.owner).post(self.url(), self.payload(starts_at='2026-10-26T22:00:00-03:00', ends_at='2026-10-27T06:00:00-03:00'), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get()
        self.assertEqual(shift.ends_at - shift.starts_at, timedelta(hours=8))

    def test_offset_required(self):
        for value in ('2026-10-26T09:00', 'invalid', '2026-02-31T09:00:00-03:00'):
            self.assertEqual(self.client_for(self.owner).post(self.url(), self.payload(starts_at=value), format='json').status_code, 400)

    def test_dst_explicit_offsets_represent_different_instants(self):
        response = self.client_for(self.owner).post(self.url(), self.payload(starts_at='2026-04-04T23:30:00-03:00', ends_at='2026-04-04T23:30:00-04:00'), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get()
        self.assertEqual(shift.ends_at - shift.starts_at, timedelta(hours=1))

    def test_patch_schedule_and_conflict(self):
        shift = self.create()
        other = self.create(start=START + timedelta(days=1))
        client = self.client_for(self.owner)
        response = client.patch(self.url(shift), {'ends_at': (START + timedelta(hours=7)).isoformat()}, format='json')
        self.assertEqual(response.status_code, 200)
        response = client.patch(self.url(shift), {'starts_at': other.starts_at.isoformat(), 'ends_at': other.ends_at.isoformat()}, format='json')
        self.assertEqual(response.status_code, 400)
        shift.refresh_from_db()
        self.assertEqual(shift.ends_at, START + timedelta(hours=7))

    def test_patch_employee_checks_conflict(self):
        shift = self.create(employee=self.colleague)
        self.create()
        response = self.client_for(self.admin).patch(self.url(shift), {'employee': str(self.employee.pk)}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cancellation_preserves_history_and_releases_slot(self):
        shift = self.create()
        client = self.client_for(self.owner)
        for _ in range(2):
            self.assertEqual(client.delete(self.url(shift)).status_code, 204)
        shift.refresh_from_db()
        self.assertEqual(shift.status, 'CANCELLED')
        self.assertEqual(Shift.objects.count(), 1)
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 201)

    def test_cancel_with_patch_and_no_reactivation(self):
        shift = self.create()
        client = self.client_for(self.admin)
        self.assertEqual(client.patch(self.url(shift), {'status': 'CANCELLED'}, format='json').status_code, 200)
        self.assertEqual(client.patch(self.url(shift), {'status': 'SCHEDULED'}, format='json').status_code, 400)

    def test_inactive_employee_rejected_but_can_cancel_existing(self):
        shift = self.create()
        self.employee.is_active = False
        self.employee.save()
        client = self.client_for(self.owner)
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 400)
        self.assertEqual(client.patch(self.url(shift), {'ends_at': (START + timedelta(hours=6)).isoformat()}, format='json').status_code, 400)
        self.assertEqual(client.delete(self.url(shift)).status_code, 204)

    def test_employee_can_only_read_own(self):
        own = self.create()
        other = self.create(employee=self.colleague)
        client = self.client_for(self.worker)
        response = client.get(self.url() + '?date_from=2026-10-26&date_to=2026-11-02')
        self.assertEqual([row['id'] for row in response.data['results']], [str(own.pk)])
        self.assertEqual(client.get(self.url(own)).status_code, 200)
        self.assertEqual(client.get(self.url(other)).status_code, 404)
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 403)
        self.assertEqual(client.patch(self.url(own), {'status': 'CANCELLED'}, format='json').status_code, 403)
        self.assertEqual(client.delete(self.url(own)).status_code, 403)

    def test_cross_business_and_unknown_worker_have_same_error(self):
        client = self.client_for(self.owner)
        responses = [client.post(self.url(), self.payload(employee=str(value)), format='json') for value in (self.foreign.pk, uuid.uuid4())]
        self.assertEqual(responses[0].status_code, 400)
        self.assertEqual(responses[0].data, responses[1].data)

    def test_external_uuids_not_readable_or_mutable(self):
        shift = Shift.objects.create(business=self.other, employee=self.foreign, starts_at=START, ends_at=START + timedelta(hours=8))
        for user in (self.owner, self.admin, self.worker, self.outsider):
            client = self.client_for(user)
            self.assertEqual(client.get(self.url(shift, self.other)).status_code, 404)
            self.assertEqual(client.patch(self.url(shift, self.other), {}, format='json').status_code, 404)
            self.assertEqual(client.delete(self.url(shift, self.other)).status_code, 404)
        self.assertEqual(self.client_for(self.owner).patch(self.url(shift), {}, format='json').status_code, 404)

    def test_inactive_membership(self):
        membership = Membership.objects.get(user=self.admin, business=self.business)
        membership.is_active = False
        membership.save()
        client = self.client_for(self.admin)
        self.assertEqual(client.get(self.url()).status_code, 404)
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 404)

    def test_anonymous_and_csrf(self):
        shift = self.create()
        anonymous = self.client_for(None)
        self.assertEqual(anonymous.get(self.url()).status_code, 403)
        self.assertEqual(anonymous.post(self.url(), self.payload(), format='json').status_code, 403)
        client = self.client_for(self.owner)
        client.credentials()
        self.assertEqual(client.post(self.url(), self.payload(), format='json').status_code, 403)
        self.assertEqual(client.patch(self.url(shift), {}, format='json').status_code, 403)
        self.assertEqual(client.delete(self.url(shift)).status_code, 403)

    def test_body_cannot_change_business_or_assign_roles(self):
        shift = self.create()
        client = self.client_for(self.owner)
        for field in ('business', 'business_id', 'role', 'created_at'):
            self.assertEqual(client.patch(self.url(shift), {field: str(self.other.pk)}, format='json').status_code, 400)

    def test_date_range_includes_carryover_excludes_history(self):
        carryover = self.create(start=datetime(2026, 10, 26, 1, tzinfo=timezone.utc), end=datetime(2026, 10, 26, 5, tzinfo=timezone.utc))
        self.create(start=START - timedelta(days=10))
        self.create(start=START + timedelta(days=10))
        response = self.client_for(self.owner).get(self.url() + '?date_from=2026-10-26&date_to=2026-11-02')
        self.assertEqual([row['id'] for row in response.data['results']], [str(carryover.pk)])

    def test_invalid_date_ranges(self):
        client = self.client_for(self.owner)
        for query in ('date_from=2026-10-26', 'date_from=bad&date_to=2026-11-02', 'date_from=2026-11-02&date_to=2026-10-26', 'date_from=2026-01-01&date_to=2026-12-31'):
            self.assertEqual(client.get(self.url() + '?' + query).status_code, 400)

    def test_database_duration_and_status_constraints(self):
        for values in ({'ends_at': START}, {'status': 'INVALID'}):
            data = dict(business=self.business, employee=self.employee, starts_at=START, ends_at=START + timedelta(hours=1))
            data.update(values)
            with self.assertRaises(IntegrityError), transaction.atomic():
                Shift.objects.bulk_create([Shift(**data)])


class ShiftConcurrencyTests(TransactionTestCase):
    def test_only_one_conflicting_creation_commits(self):
        business = Business.objects.create(name='Concurrent shifts')
        employee = Employee.objects.create(business=business, first_name='Concurrent', last_name='Worker')
        barrier = Barrier(2)

        def create(_):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                Shift.objects.create(business_id=business.pk, employee_id=employee.pk, starts_at=START, ends_at=START + timedelta(hours=8))
                return True
            except ValidationError:
                return False
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(create, range(2)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(Shift.objects.count(), 1)
