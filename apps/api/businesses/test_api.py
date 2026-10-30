import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Business, Employee, Membership
from .services import write_employee

User = get_user_model()
ROOT = '/api/v1/businesses/'


class BusinessAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.business = Business.objects.create(name='A')
        cls.other = Business.objects.create(name='B')
        cls.owner = User.objects.create_user(username='owner', email='owner@example.com')
        cls.admin = User.objects.create_user(username='admin', email='admin@example.com')
        cls.worker = User.objects.create_user(username='worker', email='worker@example.com')
        cls.outsider = User.objects.create_user(username='outsider', email='outsider@example.com')
        cls.other_owner = User.objects.create_user(username='other-owner', email='other@example.com')
        for user, business, role in (
            (cls.owner, cls.business, 'OWNER'), (cls.admin, cls.business, 'ADMIN'),
            (cls.worker, cls.business, 'EMPLOYEE'), (cls.other_owner, cls.other, 'OWNER'),
        ):
            Membership.objects.create(user=user, business=business, role=role)
        cls.own_record = Employee.objects.create(business=cls.business, user=cls.worker, first_name='Worker', last_name='A')
        cls.colleague = Employee.objects.create(business=cls.business, first_name='Colleague', last_name='A')
        cls.foreign_record = Employee.objects.create(business=cls.other, first_name='Private', last_name='B')

    def client_for(self, user):
        client = APIClient(enforce_csrf_checks=True)
        if user:
            client.force_login(user)
        token = client.get('/api/v1/auth/csrf/').data['csrfToken']
        client.credentials(HTTP_X_CSRFTOKEN=token)
        return client

    def employees_url(self, business=None, employee=None):
        url = f'{ROOT}{(business or self.business).pk}/employees/'
        return url + f'{employee.pk}/' if employee else url

    def test_create_business_and_owner(self):
        response = self.client_for(self.outsider).post(ROOT, {'name': 'New'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        membership = Membership.objects.get(business_id=response.data['id'])
        self.assertEqual(membership.user, self.outsider)
        self.assertEqual(membership.role, 'OWNER')
        self.assertTrue(membership.is_active)

    def test_business_creation_rolls_back(self):
        before = Business.objects.count()
        with patch('businesses.services.Membership.objects.create', side_effect=IntegrityError):
            response = self.client_for(self.outsider).post(ROOT, {'name': 'Rolled back'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Business.objects.count(), before)

    def test_business_list_and_detail_scoped(self):
        client = self.client_for(self.owner)
        response = client.get(ROOT)
        self.assertEqual([b['id'] for b in response.data['results']], [str(self.business.pk)])
        self.assertEqual(client.get(f'{ROOT}{self.business.pk}/').status_code, 200)
        foreign = client.get(f'{ROOT}{self.other.pk}/')
        missing = client.get(f'{ROOT}{uuid.uuid4()}/')
        self.assertEqual(foreign.status_code, 404)
        self.assertEqual(foreign.data, missing.data)

    def test_business_role_is_current_users_role_and_read_only(self):
        for user, role in ((self.owner, 'OWNER'), (self.admin, 'ADMIN'), (self.worker, 'EMPLOYEE')):
            client = self.client_for(user)
            self.assertEqual(client.get(f'{ROOT}{self.business.pk}/').data['role'], role)
            self.assertEqual(client.get(ROOT).data['results'][0]['role'], role)
            self.assertEqual(client.post(ROOT, {'name': 'Rejected', 'role': 'OWNER'}, format='json').status_code, 400)

    def test_business_protected_fields_rejected(self):
        client = self.client_for(self.owner)
        for field, value in (('role', 'OWNER'), ('owner', str(self.owner.pk)), ('is_active', False)):
            with self.subTest(field=field):
                self.assertEqual(client.post(ROOT, {'name': 'Invalid', field: value}, format='json').status_code, 400)

    def test_owner_and_admin_create_employee(self):
        for user in (self.owner, self.admin):
            with self.subTest(user=user.username):
                response = self.client_for(user).post(self.employees_url(), {'first_name': 'New', 'last_name': 'Worker'}, format='json')
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data['business'], self.business.pk)
                self.assertIsNone(response.data['user'])

    def test_worker_cannot_create_or_patch(self):
        client = self.client_for(self.worker)
        self.assertEqual(client.post(self.employees_url(), {'first_name': 'New', 'last_name': 'Worker'}, format='json').status_code, 403)
        self.assertEqual(client.patch(self.employees_url(employee=self.own_record), {'first_name': 'Changed'}, format='json').status_code, 403)

    def test_worker_sees_only_own_record(self):
        client = self.client_for(self.worker)
        response = client.get(self.employees_url())
        self.assertEqual([row['id'] for row in response.data['results']], [str(self.own_record.pk)])
        self.assertEqual(client.get(self.employees_url(employee=self.own_record)).data['user'], str(self.worker.pk))
        self.assertEqual(client.get(self.employees_url(employee=self.colleague)).status_code, 404)

    def test_owner_admin_updates(self):
        for user in (self.owner, self.admin):
            response = self.client_for(user).patch(self.employees_url(employee=self.colleague), {'first_name': user.username}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
        self.colleague.refresh_from_db()
        self.assertEqual(self.colleague.first_name, 'admin')

    def test_cannot_move_employee_or_assign_roles(self):
        client = self.client_for(self.owner)
        for field, value in (('business', str(self.other.pk)), ('business_id', str(self.other.pk)), ('role', 'OWNER'), ('is_staff', True)):
            with self.subTest(field=field):
                response = client.patch(self.employees_url(employee=self.colleague), {field: value}, format='json')
                self.assertEqual(response.status_code, 400)
                response = client.post(self.employees_url(), {'first_name': 'New', 'last_name': 'Worker', field: value}, format='json')
                self.assertEqual(response.status_code, 400)
        self.colleague.refresh_from_db()
        self.assertEqual(self.colleague.business, self.business)

    def test_cross_business_access_all_roles(self):
        for user in (self.owner, self.admin, self.worker, self.outsider):
            client = self.client_for(user)
            for url in (self.employees_url(self.other), self.employees_url(self.other, self.foreign_record)):
                with self.subTest(user=user.username, url=url):
                    self.assertEqual(client.get(url).status_code, 404)
                    self.assertEqual(client.post(url, {}, format='json').status_code, 404)
                    self.assertEqual(client.patch(url, {}, format='json').status_code, 404)
        self.assertEqual(self.client_for(self.admin).get(self.employees_url(employee=self.foreign_record)).status_code, 404)

    def test_authenticated_nonmember_cannot_read_private_business(self):
        client = self.client_for(self.outsider)
        self.assertEqual(client.get(ROOT).data['results'], [])
        self.assertEqual(client.get(f'{ROOT}{self.business.pk}/').status_code, 404)
        self.assertEqual(client.get(self.employees_url()).status_code, 404)

    def test_inactive_membership_denies_access(self):
        membership = Membership.objects.get(user=self.admin, business=self.business)
        membership.is_active = False
        membership.save()
        client = self.client_for(self.admin)
        self.assertEqual(client.get(ROOT).data['results'], [])
        self.assertEqual(client.get(self.employees_url()).status_code, 404)
        self.assertEqual(client.post(self.employees_url(), {}, format='json').status_code, 404)

    def test_inactive_business_denies_access(self):
        self.business.is_active = False
        self.business.save()
        client = self.client_for(self.owner)
        self.assertEqual(client.get(ROOT).data['results'], [])
        self.assertEqual(client.get(self.employees_url()).status_code, 404)

    def test_admin_in_a_with_employee_role_in_b_cannot_write_b(self):
        Membership.objects.create(user=self.admin, business=self.other, role='EMPLOYEE')
        record = Employee.objects.create(business=self.other, user=self.admin, first_name='Admin in A', last_name='Worker in B')
        client = self.client_for(self.admin)
        self.assertEqual(client.get(self.employees_url(self.other, record)).status_code, 200)
        self.assertEqual(client.patch(self.employees_url(self.other, record), {'first_name': 'Rejected'}, format='json').status_code, 403)
        self.assertEqual(client.get(self.employees_url(self.other, self.foreign_record)).status_code, 404)

    def test_write_service_rechecks_revoked_permission(self):
        from rest_framework.exceptions import PermissionDenied
        membership = Membership.objects.get(user=self.admin, business=self.business)
        membership.role = 'EMPLOYEE'
        membership.save()
        with self.assertRaises(PermissionDenied):
            write_employee(self.admin, self.business.pk, {'first_name': 'Rejected'}, employee_id=self.colleague.pk)
        self.colleague.refresh_from_db()
        self.assertEqual(self.colleague.first_name, 'Colleague')

    def test_inactive_user_session_denied(self):
        client = self.client_for(self.owner)
        self.owner.is_active = False
        self.owner.save()
        self.assertEqual(client.get(ROOT).status_code, 403)

    def test_link_requires_active_membership_without_user_enumeration(self):
        client = self.client_for(self.owner)
        errors = []
        for user_id in (self.outsider.pk, self.other_owner.pk, uuid.uuid4()):
            response = client.patch(self.employees_url(employee=self.colleague), {'user': str(user_id)}, format='json')
            self.assertEqual(response.status_code, 400)
            errors.append(response.data)
        self.assertEqual(errors[0], errors[1])
        self.assertEqual(errors[1], errors[2])
        Membership.objects.create(user=self.outsider, business=self.business, is_active=False)
        self.assertEqual(client.patch(self.employees_url(employee=self.colleague), {'user': str(self.outsider.pk)}, format='json').status_code, 400)

    def test_valid_link_duplicate_and_unlink(self):
        client = self.client_for(self.owner)
        url = self.employees_url(employee=self.colleague)
        response = client.patch(url, {'user': str(self.admin.pk)}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['user'], str(self.admin.pk))
        response = client.post(self.employees_url(), {'first_name': 'Duplicate', 'last_name': 'Worker', 'user': str(self.admin.pk)}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(client.patch(url, {'user': None}, format='json').status_code, 200)

    def test_anonymous_denied(self):
        client = self.client_for(None)
        for url in (ROOT, f'{ROOT}{self.business.pk}/', self.employees_url(), self.employees_url(employee=self.colleague)):
            self.assertEqual(client.get(url).status_code, 403)
            self.assertEqual(client.post(url, {}, format='json').status_code, 403)

    def test_csrf_required_for_business_and_employee_writes(self):
        client = self.client_for(self.owner)
        client.credentials()
        self.assertEqual(client.post(ROOT, {'name': 'Rejected'}, format='json').status_code, 403)
        self.assertEqual(client.post(self.employees_url(), {'first_name': 'New', 'last_name': 'Worker'}, format='json').status_code, 403)
        self.assertEqual(client.patch(self.employees_url(employee=self.colleague), {'first_name': 'Rejected'}, format='json').status_code, 403)

    def test_unsupported_delete_and_put(self):
        client = self.client_for(self.owner)
        url = self.employees_url(employee=self.colleague)
        self.assertEqual(client.delete(url).status_code, 405)
        self.assertEqual(client.put(url, {}, format='json').status_code, 405)

    def test_private_responses_no_cache_or_passwords(self):
        client = self.client_for(self.owner)
        response = client.get(self.employees_url())
        self.assertIn('no-store', response['Cache-Control'])
        self.assertNotIn('password', response.content.decode())
        self.assertNotIn('pbkdf2', response.content.decode())

    def test_linked_membership_cannot_be_disabled_deleted_or_reassigned(self):
        membership = Membership.objects.get(user=self.worker, business=self.business)
        membership.is_active = False
        with self.assertRaises(ValidationError):
            membership.save()
        membership.refresh_from_db()
        membership.user = self.outsider
        with self.assertRaises(ValidationError):
            membership.save()
        membership.refresh_from_db()
        with self.assertRaises(ValidationError), transaction.atomic():
            membership.delete()
        with self.assertRaises(ValidationError), transaction.atomic():
            Membership.objects.filter(pk=membership.pk).delete()
        self.own_record.user = None
        self.own_record.save()
        membership.is_active = False
        membership.save()
        self.assertFalse(Membership.objects.get(pk=membership.pk).is_active)
