import uuid
from datetime import date
from unittest.mock import patch

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.utils import timezone

from .models import Business, Employee, Membership
from .validators import normalize_rut


class BusinessModelsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.business = Business.objects.create(name='Business A')
        cls.other_business = Business.objects.create(name='Business B')
        cls.user = get_user_model().objects.create_user(
            username='owner', email='owner@example.com', password='test-password'
        )
        cls.membership = Membership.objects.create(
            user=cls.user, business=cls.business, role=Membership.Role.OWNER
        )

    def employee(self, **overrides):
        values = dict(business=self.business, first_name='Ana', last_name='Pérez')
        values.update(overrides)
        return Employee.objects.create(**values)

    def test_business_defaults(self):
        self.assertIsInstance(self.business.pk, uuid.UUID)
        self.assertEqual(self.business.rut, '')
        self.assertTrue(self.business.is_active)
        self.assertIsNotNone(self.business.created_at)

    def test_employee_without_account(self):
        employee = self.employee()
        self.assertIsInstance(employee.pk, uuid.UUID)
        self.assertIsNone(employee.user)
        self.assertIsNone(employee.hire_date)
        self.assertEqual(employee.email, '')
        self.assertTrue(employee.is_active)
        self.employee()  # Multiple workers without accounts are allowed.

    def test_employee_optional_fields(self):
        employee = self.employee(email='ana@example.com', hire_date=date(2026, 10, 28))
        employee.refresh_from_db()
        self.assertEqual(employee.hire_date, date(2026, 10, 28))

    def test_employee_requires_business(self):
        with self.assertRaises(ValidationError):
            self.employee(business=None)

    def test_membership_unique_at_database_level(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(user=self.user, business=self.business)

    def test_invalid_role_rejected_by_database(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(
                user=self.user, business=self.other_business, role='INVALID'
            )

    def test_user_can_belong_to_multiple_businesses(self):
        Membership.objects.create(user=self.user, business=self.other_business)
        self.assertEqual(self.user.memberships.count(), 2)
        self.assertEqual(self.business.memberships.get().user, self.user)

    def test_business_scoped_relationships(self):
        first = self.employee()
        second = self.employee(business=self.other_business)
        self.assertQuerySetEqual(self.business.employees.all(), [first])
        self.assertQuerySetEqual(self.other_business.employees.all(), [second])
        self.assertFalse(self.business.employees.filter(pk=second.pk).exists())
        self.assertFalse(self.other_business.memberships.exists())

    def test_link_user_with_matching_membership(self):
        self.assertEqual(self.employee(user=self.user).user, self.user)

    def test_clean_rejects_membership_in_another_business(self):
        employee = Employee(
            business=self.other_business, user=self.user,
            first_name='Ana', last_name='Pérez',
        )
        with self.assertRaisesMessage(ValidationError, 'membership in this business'):
            employee.full_clean()

    def test_save_rejects_user_without_matching_membership(self):
        with self.assertRaises(ValidationError):
            self.employee(business=self.other_business, user=self.user)
        self.assertFalse(self.other_business.employees.exists())

    def test_changing_business_requires_matching_membership(self):
        employee = self.employee(user=self.user)
        employee.business = self.other_business
        with self.assertRaises(ValidationError):
            employee.save()
        employee.refresh_from_db()
        self.assertEqual(employee.business, self.business)

    def test_user_can_be_worker_in_two_businesses_with_memberships(self):
        Membership.objects.create(user=self.user, business=self.other_business)
        self.employee(user=self.user)
        self.employee(user=self.user, business=self.other_business)
        self.assertEqual(self.user.employee_records.count(), 2)

    def test_inactive_membership_rejects_relationship(self):
        self.membership.is_active = False
        self.membership.save()
        with self.assertRaises(ValidationError):
            self.employee(user=self.user)

    def test_duplicate_worker_account_rejected(self):
        self.employee(user=self.user)
        with self.assertRaises(ValidationError):
            self.employee(user=self.user)

    def test_business_with_dependents_is_protected(self):
        self.employee()
        with self.assertRaises(ProtectedError):
            self.business.delete()

    def test_rut_normalization_and_check_digits(self):
        # Synthetic mathematical fixtures; no real business identity is asserted.
        for value, expected in (
            ('12.345.678-5', '12345678-5'),
            ('123456785', '12345678-5'),
            (' 6-k ', '6-K'),
            ('14-0', '14-0'),
            ('00000006-K', '6-K'),
            ('', ''),
            ('   ', ''),
        ):
            with self.subTest(value=value):
                self.assertEqual(normalize_rut(value), expected)

    def test_invalid_rut_rejected_on_save(self):
        for value in ('12345678-9', '0-0', '12..345.678-5', 'ABC', '1 4-0', '123456789-0', None):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                Business.objects.create(name='Invalid RUT fixture', rut=value)

    def test_rut_saved_in_canonical_form(self):
        business = Business.objects.create(name='RUT fixture', rut='12.345.678-5')
        business.refresh_from_db()
        self.assertEqual(business.rut, '12345678-5')

    def test_duplicate_normalized_rut_rejected(self):
        Business.objects.create(name='First fixture', rut='12.345.678-5')
        with self.assertRaises(ValidationError):
            Business.objects.create(name='Second fixture', rut='123456785')

    def test_rut_unique_at_database_level(self):
        Business.objects.create(name='First fixture', rut='12345678-5')
        with self.assertRaises(IntegrityError), transaction.atomic():
            Business.objects.bulk_create([Business(name='Second fixture', rut='12345678-5')])

    def test_business_names_and_empty_ruts_can_repeat(self):
        Business.objects.create(name=self.business.name)
        self.assertEqual(Business.objects.filter(name=self.business.name, rut='').count(), 2)

    def test_business_name_required(self):
        with self.assertRaises(ValidationError):
            Business.objects.create(name='')

    def test_timestamps(self):
        employee = self.employee()
        self.assertIsNotNone(self.membership.created_at)
        for instance in (self.business, employee):
            with self.subTest(model=type(instance).__name__):
                created_at = instance.created_at
                later = timezone.now() + timezone.timedelta(days=1)
                with patch('django.utils.timezone.now', return_value=later):
                    instance.save()
                instance.refresh_from_db()
                self.assertEqual(instance.created_at, created_at)
                self.assertEqual(instance.updated_at, later)

    def test_owner_role_does_not_grant_global_permissions(self):
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)
        self.assertFalse(self.user.user_permissions.exists())

    def test_worker_uniqueness_at_database_level(self):
        self.employee(user=self.user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Employee.objects.bulk_create([
                Employee(business=self.business, user=self.user, first_name='Duplicate', last_name='Fixture')
            ])

    def test_employee_emails_can_repeat(self):
        self.employee(email='shared@example.com')
        self.employee(email='shared@example.com')
        self.assertEqual(self.business.employees.filter(email='shared@example.com').count(), 2)

    def test_admin_business_form_normalizes_rut(self):
        from django.test import RequestFactory
        request = RequestFactory().get('/admin/')
        request.user = self.user
        form_class = admin.site._registry[Business].get_form(request)
        form = form_class(data={'name': 'Form fixture', 'rut': '12.345.678-5', 'is_active': True})
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.save().rut, '12345678-5')

    def test_admin_employee_form_requires_active_membership(self):
        from django.test import RequestFactory
        request = RequestFactory().get('/admin/')
        request.user = self.user
        self.membership.is_active = False
        self.membership.save()
        form_class = admin.site._registry[Employee].get_form(request)
        form = form_class(data={
            'business': self.business.pk, 'user': self.user.pk,
            'first_name': 'Ana', 'last_name': 'Pérez', 'is_active': True,
        })
        self.assertFalse(form.is_valid())
        self.assertIn('user', form.errors)

    def test_domain_models_registered_in_admin(self):
        for model in (Business, Membership, Employee):
            with self.subTest(model=model.__name__):
                self.assertIn(model, admin.site._registry)

    def test_changing_user_requires_matching_active_membership(self):
        employee = self.employee(user=self.user)
        employee.user = get_user_model().objects.create_user(
            username='unrelated', email='unrelated@example.com'
        )
        with self.assertRaises(ValidationError):
            employee.save()
        employee.refresh_from_db()
        self.assertEqual(employee.user, self.user)
