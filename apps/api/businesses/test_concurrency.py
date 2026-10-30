from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import close_old_connections
from django.test import TransactionTestCase

from .models import Business, Employee, Membership


class MembershipConcurrencyTests(TransactionTestCase):
    def test_link_and_deactivation_cannot_leave_inactive_link(self):
        business = Business.objects.create(name='Concurrent test')
        user = get_user_model().objects.create_user(username='concurrent', email='concurrent@example.com')
        membership = Membership.objects.create(business=business, user=user)
        start = Barrier(2)

        def operation(link):
            close_old_connections()
            try:
                start.wait(timeout=10)
                if link:
                    Employee.objects.create(business_id=business.pk, user_id=user.pk, first_name='Test', last_name='Worker')
                else:
                    current = Membership.objects.get(pk=membership.pk)
                    current.is_active = False
                    current.save()
                return True
            except ValidationError:
                return False
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(operation, (True, False)))
        self.assertEqual(sum(results), 1)
        membership.refresh_from_db()
        self.assertFalse(Employee.objects.filter(user=user).exists() and not membership.is_active)
