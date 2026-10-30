from datetime import datetime, timedelta, timezone

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Business, Employee, Membership, Shift
from .leave_services import create_leave


class DirectoryFilterTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.business = Business.objects.create(name='Directory A')
        cls.other = Business.objects.create(name='Directory B')
        cls.owner = get_user_model().objects.create_user(username='directory_owner', email='owner@example.test')
        cls.worker = get_user_model().objects.create_user(username='directory_worker', email='worker@example.test')
        Membership.objects.create(user=cls.owner, business=cls.business, role='OWNER')
        Membership.objects.create(user=cls.worker, business=cls.business, role='EMPLOYEE')
        Employee.objects.bulk_create([Employee(business=cls.business, first_name='Earlier', last_name=str(index)) for index in range(51)])
        cls.person = Employee.objects.create(business=cls.business, user=cls.worker, first_name='Valentina', last_name='Rojas', email='valentina@example.test')
        cls.inactive = Employee.objects.create(business=cls.business, first_name='Inactive', last_name='Person', is_active=False)
        cls.foreign = Employee.objects.create(business=cls.other, first_name='Foreign', last_name='Person')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.root = f'/api/v1/businesses/{self.business.pk}/'

    def test_search_finds_records_beyond_first_page(self):
        first = self.client.get(self.root + 'employees/').data
        self.assertEqual(len(first['results']), 50)
        self.assertNotIn(str(self.person.pk), [row['id'] for row in first['results']])
        for term in ('Valentina', 'valentina rojas', 'valentina@example.test'):
            response = self.client.get(self.root + 'employees/', {'search': term})
            self.assertEqual([row['id'] for row in response.data['results']], [str(self.person.pk)])

    def test_active_filter_count_and_input_validation(self):
        response = self.client.get(self.root + 'employees/?is_active=false')
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], str(self.inactive.pk))
        self.assertEqual(self.client.get(self.root + 'employees/?is_active=true').data['count'], 52)
        for values in ({'search': 'x' * 151}, {'is_active': 'invalid'}):
            self.assertEqual(self.client.get(self.root + 'employees/', values).status_code, 400)

    def test_search_preserves_employee_scope_and_business_isolation(self):
        self.assertEqual(self.client.get(self.root + 'employees/?search=Foreign').data['count'], 0)
        self.client.force_authenticate(self.worker)
        self.assertEqual(self.client.get(self.root + 'employees/?search=Earlier').data['count'], 0)
        self.assertEqual(self.client.get(self.root + 'employees/?is_active=true').data['count'], 1)
        self.assertEqual(self.client.get(f'/api/v1/businesses/{self.other.pk}/employees/?search=Foreign').status_code, 404)

    def test_request_employee_filter_remains_scoped(self):
        leave = create_leave(self.worker, self.business.pk, dict(request_type='PERSONAL', start_date='2026-10-29', end_date='2026-10-29'))
        response = self.client.get(self.root + f'leave-requests/?employee={self.person.pk}')
        self.assertEqual(response.data['results'][0]['id'], str(leave.pk))
        self.assertEqual(self.client.get(self.root + f'leave-requests/?employee={self.foreign.pk}').data['count'], 0)
        self.assertEqual(self.client.get(self.root + 'leave-requests/?employee=invalid').status_code, 400)
        self.client.force_authenticate(self.worker)
        self.assertEqual(self.client.get(self.root + f'leave-requests/?employee={self.inactive.pk}').data['count'], 0)

    def test_shift_status_filter_preserves_role_and_employee_scope(self):
        start = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)
        Shift.objects.create(business=self.business, employee=self.person, starts_at=start, ends_at=start + timedelta(hours=8))
        Shift.objects.create(business=self.business, employee=self.person, starts_at=start, ends_at=start + timedelta(hours=8), status='CANCELLED')
        query = 'shifts/?date_from=2026-10-29&date_to=2026-10-30'
        self.assertEqual(self.client.get(self.root + query + '&status=SCHEDULED').data['count'], 1)
        self.assertEqual(self.client.get(self.root + query + '&status=CANCELLED').data['count'], 1)
        self.assertEqual(self.client.get(self.root + query + '&status=INVALID').status_code, 400)
        self.client.force_authenticate(self.worker)
        self.assertEqual(self.client.get(self.root + query + f'&status=SCHEDULED&employee={self.foreign.pk}').data['count'], 0)
