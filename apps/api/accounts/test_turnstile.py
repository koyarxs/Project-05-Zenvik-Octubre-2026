import json
from unittest.mock import MagicMock, patch
from urllib.error import URLError

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, SimpleTestCase, override_settings
from rest_framework.test import APIClient

from config.deployment import validate_turnstile_configuration


@override_settings(TURNSTILE_ENABLED=True, TURNSTILE_SITE_KEY='public-fixture-key', TURNSTILE_SECRET_KEY='private-fixture-key', TURNSTILE_ALLOWED_HOSTNAMES=['testserver'])
class TurnstileAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='turnstile_user', email='turnstile@example.test', password='Turnstile-test!92741')

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        config = self.client.get('/api/v1/auth/csrf/').data
        self.client.credentials(HTTP_X_CSRFTOKEN=config['csrfToken'])
        self.login_data = {'username': 'turnstile_user', 'password': 'Turnstile-test!92741', 'turnstile_token': 'opaque-fixture-token'}
        self.register_data = {'username': 'new_turnstile', 'email': 'new-turnstile@example.test', 'password': 'Turnstile-test!92741', 'turnstile_token': 'opaque-fixture-token'}

    def response(self, action='login', **changes):
        data = {'success': True, 'action': action, 'hostname': 'testserver', **changes}
        result = MagicMock()
        result.__enter__.return_value.read.return_value = json.dumps(data).encode()
        return result

    def test_public_config_never_exposes_secret(self):
        response = self.client.get('/api/v1/auth/csrf/')
        self.assertEqual(response.data['turnstile'], {'enabled': True, 'siteKey': 'public-fixture-key'})
        self.assertNotIn('private-fixture-key', str(response.data))

    @patch('accounts.views.RegisterSerializer')
    def test_registration_challenge_precedes_account_validation(self, serializer):
        response = self.client.post('/api/v1/auth/register/', {'username': 'turnstile_user', 'email': 'turnstile@example.test'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('turnstile_token', response.data)
        serializer.assert_not_called()

    @patch('accounts.turnstile.urlopen')
    def test_missing_tokens_block_both_flows_before_user_creation_or_login(self, upstream):
        for endpoint, data in [('login', self.login_data), ('register', self.register_data)]:
            data = {k: v for k, v in data.items() if k != 'turnstile_token'}
            response = self.client.post(f'/api/v1/auth/{endpoint}/', data, format='json')
            self.assertEqual(response.status_code, 400)
            self.assertIn('turnstile_token', response.data)
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 403)
        upstream.assert_not_called()

    @patch('accounts.turnstile.urlopen')
    def test_valid_login_and_only_token_sent_to_cloudflare(self, upstream):
        upstream.return_value = self.response()
        response = self.client.post('/api/v1/auth/login/', self.login_data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        request = upstream.call_args.args[0]
        self.assertEqual(request.full_url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
        self.assertEqual(set(json.loads(request.data)), {'secret', 'response'})
        self.assertEqual(upstream.call_args.kwargs['timeout'], 5)
        self.assertNotIn('turnstile_token', response.data)

    @patch('accounts.turnstile.urlopen')
    def test_valid_registration_does_not_store_token(self, upstream):
        upstream.return_value = self.response(action='register')
        response = self.client.post('/api/v1/auth/register/', self.register_data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(response.data), {'id', 'username', 'email'})
        self.assertTrue(get_user_model().objects.get(username='new_turnstile').check_password(self.register_data['password']))

    @patch('accounts.turnstile.urlopen')
    def test_wrong_action_or_hostname_or_provider_failure_rejected(self, upstream):
        for data in ({'action': 'register'}, {'hostname': 'untrusted.example'}, {'success': False}, {'success': 'true'}):
            upstream.return_value = self.response(**data)
            response = self.client.post('/api/v1/auth/login/', self.login_data, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 403)

    @patch('accounts.turnstile.urlopen')
    def test_duplicate_or_expired_token_rejected(self, upstream):
        upstream.return_value = self.response(success=False, **{'error-codes': ['timeout-or-duplicate']})
        self.assertEqual(self.client.post('/api/v1/auth/login/', self.login_data, format='json').status_code, 400)

    @patch('accounts.turnstile.urlopen', side_effect=URLError('private-transport-details'))
    def test_provider_unavailable_fails_closed_without_exception_details(self, upstream):
        response = self.client.post('/api/v1/auth/login/', self.login_data, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private-transport-details', str(response.data))
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 403)

    @patch('accounts.turnstile.urlopen')
    def test_malformed_or_oversized_response_fails_closed(self, upstream):
        for payload in (b'invalid-json', b'[]', b'x' * 16385):
            upstream.return_value.__enter__.return_value.read.return_value = payload
            self.assertEqual(self.client.post('/api/v1/auth/login/', self.login_data, format='json').status_code, 503)

    @patch('accounts.turnstile.urlopen')
    def test_csrf_checked_before_cloudflare(self, upstream):
        self.client.credentials()
        self.assertEqual(self.client.post('/api/v1/auth/login/', self.login_data, format='json').status_code, 403)
        upstream.assert_not_called()

    @patch('accounts.turnstile.urlopen')
    def test_oversized_token_rejected_before_network(self, upstream):
        self.assertEqual(self.client.post('/api/v1/auth/login/', {**self.login_data, 'turnstile_token': 'x' * 2049}, format='json').status_code, 400)
        upstream.assert_not_called()

    @override_settings(TURNSTILE_ENABLED=False)
    @patch('accounts.turnstile.urlopen')
    def test_disabled_local_mode_uses_no_external_service(self, upstream):
        data = {k: v for k, v in self.login_data.items() if k != 'turnstile_token'}
        self.assertEqual(self.client.post('/api/v1/auth/login/', data, format='json').status_code, 200)
        upstream.assert_not_called()

    @override_settings(PUBLIC_REGISTRATION_ENABLED=False)
    @patch('accounts.turnstile.urlopen')
    def test_registration_flag_still_enforced(self, upstream):
        self.assertEqual(self.client.post('/api/v1/auth/register/', self.register_data, format='json').status_code, 403)
        upstream.assert_not_called()


class TurnstileConfigurationTests(SimpleTestCase):
    def test_required_keys_and_hostnames(self):
        data = dict(enabled=True, production=False, site_key='public-key', secret_key='private-key', hostnames=['localhost'])
        validate_turnstile_configuration(**data)
        for update in ({'site_key': ''}, {'secret_key': ''}, {'hostnames': []}, {'hostnames': ['*.example.test']}, {'hostnames': ['https://example.test']}, {'hostnames': ['example.test:443']}):
            with self.assertRaises(ImproperlyConfigured):
                validate_turnstile_configuration(**{**data, **update})

    def test_dummy_keys_rejected_in_production(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_turnstile_configuration(enabled=True, production=True, site_key='1x00000000000000000000AA', secret_key='private-key', hostnames=['example.test'])
