import uuid

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.db import IntegrityError, transaction
from django.test import TestCase


class UserTests(TestCase):
    def test_native_user_features(self):
        User = get_user_model()
        user = User.objects.create_user(
            username='ana', email='ana@example.com', password='test-password'
        )
        self.assertIsInstance(user.pk, uuid.UUID)
        self.assertTrue(user.check_password('test-password'))
        self.assertEqual(User.USERNAME_FIELD, 'username')
        self.assertIsInstance(admin.site._registry[User], UserAdmin)
        self.assertFalse(user.groups.exists())
        self.assertFalse(user.user_permissions.exists())

    def test_email_unique(self):
        User = get_user_model()
        User.objects.create_user(username='first', email='same@example.com')
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(username='second', email='same@example.com')
