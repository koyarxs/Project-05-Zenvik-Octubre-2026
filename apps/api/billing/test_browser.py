"""A simulated provider exists only inside this isolated LiveServerTestCase."""
import os
from pathlib import Path
import shutil
import subprocess
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import LiveServerTestCase, override_settings
from businesses.models import Business, Membership
from .models import PaymentOrder, Plan, PlanVersion, Price
from .providers import VerifiedPayment


@skipUnless(os.environ.get('ZENVIK_E2E') == '1', 'Run via the isolated browser runner')
@override_settings(TURNSTILE_ENABLED=False)
class BillingBrowserTests(LiveServerTestCase):
    host = '127.0.0.1'

    def test_billing_checkout_against_isolated_api(self):
        users = {}
        for name in ['billing_owner', 'billing_worker']:
            users[name] = get_user_model().objects.create_user(username=name, email=f'{name}@example.test', password='Browser-test!pass-9274')
        other = Business.objects.create(name='Negocio privado ajeno')
        plan = Plan.objects.create(code='billing-e2e', name='Plan sintético E2E', published=True)
        version = PlanVersion.objects.create(plan=plan, number=1, features=['employees', 'shifts', 'leaves', 'worker_portal'], limits={'active_employees': 1})
        Price.objects.create(version=version, amount=1000, currency='CLP', interval='MONTH', published=True)

        class TestProvider:
            name = 'flow_sandbox'

            def checkout(self, order, email):
                Membership.objects.get_or_create(user=users['billing_worker'], business=order.subscription.business, defaults={'role': 'EMPLOYEE'})
                return f'https://sandbox.flow.cl/fixture?token={order.pk}'

            def verify(self, token):
                order = PaymentOrder.objects.get(pk=token)
                return VerifiedPayment(str(order.pk), f'fixture-{order.pk}', f'fixture-{order.pk}:paid', order.amount, order.currency, 'PAID')

        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100',
               'E2E_BUSINESS_A': str(other.pk), 'E2E_BUSINESS_B': str(other.pk), 'E2E_BILLING': '1'}
        web = Path(__file__).resolve().parents[2] / 'web'
        with patch('billing.services.provider', return_value=TestProvider()), patch('billing.views.provider', return_value=TestProvider()), patch('billing.views.checkout_available', return_value=True):
            result = subprocess.run(['node', str(web / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/billing.spec.ts'], cwd=web, env=env, timeout=240, check=False)
        self.assertEqual(result.returncode, 0, 'Billing E2E failed; inspect isolated test results.')
        screenshots = web.parent.parent / '.artifacts' / 'stage15'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (web / 'test-results').glob('stage15-*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)
