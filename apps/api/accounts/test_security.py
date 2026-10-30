from importlib import reload
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, SimpleTestCase, override_settings
from django.urls import clear_url_caches
from rest_framework.test import APIClient

from businesses.models import Business, Employee, Membership
from config.api import exception_handler
from config.deployment import validate_production


class DeploymentTests(SimpleTestCase):
    def settings(self, **changes):
        return dict(debug=False, hosts=['pilot.example.test'], secret='test-only-unique-configuration-secret-0123456789-ABCDEFGHIJ', origins=['https://pilot.example.test'], **changes)

    def test_accepts_explicit_https_settings(self):
        validate_production(**self.settings())

    def test_rejects_unsafe_production_settings(self):
        for update in ({'debug': True}, {'hosts': ['*']}, {'hosts': []}, {'hosts': ['.example.test']}, {'secret': 'short'}, {'secret': 'x' * 60}, {'secret': 'REPLACE_' + 'a' * 60}, {'origins': ['http://pilot.example.test']}, {'origins': ['https://*.example.test']}, {'origins': ['https://pilot.example.test/path']}):
            with self.subTest(update=list(update)):
                values = self.settings()
                values.update(update)
                with self.assertRaises(ImproperlyConfigured):
                    validate_production(**values)

    def test_internal_errors_do_not_expose_exception_details(self):
        with self.assertLogs('zenvik.security', level='ERROR') as logs:
            response = exception_handler(RuntimeError('private-sentinel-connection-details'), {})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('private-sentinel', str(response.data))
        self.assertNotIn('private-sentinel', str(logs.output))

    def test_admin_routes_disabled_by_configuration(self):
        import config.urls
        try:
            with override_settings(ADMIN_ENABLED=False):
                reload(config.urls)
                clear_url_caches()
                self.assertEqual(self.client.get('/admin/login/').status_code, 404)
        finally:
            reload(config.urls)
            clear_url_caches()


@override_settings(TURNSTILE_ENABLED=False)
class SecurityRegressionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='security-user', email='security@example.test', password='Security-test!82731')
        cls.business = Business.objects.create(name='Isolated security test')
        Membership.objects.create(user=cls.user, business=cls.business, role='OWNER')

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def login(self):
        token = self.client.get('/api/v1/auth/csrf/').data['csrfToken']
        self.client.credentials(HTTP_X_CSRFTOKEN=token)
        response = self.client.post('/api/v1/auth/login/', {'username': 'security-user', 'password': 'Security-test!82731'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_X_CSRFTOKEN=response.data['csrfToken'])

    def test_backend_limits_body_before_json_parser(self):
        with self.assertLogs('zenvik.security', level='WARNING'):
            response = self.client.generic('POST', '/api/v1/auth/login/', b'x' * 65537, content_type='application/json')
        self.assertEqual(response.status_code, 413)
        self.assertIn('no-store', response['Cache-Control'])

    def test_api_security_headers_and_no_cors(self):
        response = self.client.get('/api/v1/auth/csrf/', HTTP_ORIGIN='https://untrusted.example')
        self.assertEqual(response['X-Frame-Options'], 'DENY')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response['Referrer-Policy'], 'same-origin')
        self.assertNotIn('Access-Control-Allow-Origin', response)

    def test_logged_out_session_cannot_be_replayed(self):
        self.login()
        stolen = self.client.cookies[settings.SESSION_COOKIE_NAME].value
        self.assertEqual(self.client.post('/api/v1/auth/logout/', {}, format='json').status_code, 204)
        attacker = APIClient()
        attacker.cookies[settings.SESSION_COOKIE_NAME] = stolen
        self.assertEqual(attacker.get('/api/v1/auth/me/').status_code, 403)

    def test_expired_session_denied(self):
        self.login()
        from django.contrib.sessions.models import Session
        from django.utils import timezone
        from datetime import timedelta
        Session.objects.filter(session_key=self.client.cookies[settings.SESSION_COOKIE_NAME].value).update(expire_date=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 403)

    @override_settings(PUBLIC_REGISTRATION_ENABLED=False)
    def test_public_registration_can_be_closed(self):
        token = self.client.get('/api/v1/auth/csrf/').data['csrfToken']
        self.client.credentials(HTTP_X_CSRFTOKEN=token)
        with patch('accounts.views.reserve_auth_attempt') as limiter:
            self.assertEqual(self.client.post('/api/v1/auth/register/', {}, format='json').status_code, 403)
        limiter.assert_not_called()

    def test_sql_metacharacters_are_stored_as_data(self):
        self.login()
        payload = "x'); DROP TABLE employees; --"
        response = self.client.post(f'/api/v1/businesses/{self.business.pk}/employees/', {'first_name': payload, 'last_name': 'Test'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Employee.objects.get().first_name, payload)
        self.assertEqual(Business.objects.count(), 1)

    def test_malformed_json_and_identifiers_are_controlled(self):
        self.login()
        response = self.client.generic('POST', '/api/v1/businesses/', b'{broken', content_type='application/json', HTTP_X_CSRFTOKEN=self.client._credentials['HTTP_X_CSRFTOKEN'])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get('/api/v1/businesses/not-a-uuid/employees/').status_code, 404)

    def test_non_staff_owner_cannot_access_admin(self):
        self.login()
        response = self.client.get('/admin/')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response['Location'].startswith('/admin/login/'))

    def test_user_input_not_in_security_log(self):
        self.login()
        with self.assertLogs('zenvik.security', level='WARNING') as logs:
            self.client.post('/api/v1/businesses/', {'role': 'private-sentinel'}, format='json')
        self.assertNotIn('private-sentinel', str(logs.output))
        self.assertNotIn('sessionid', str(logs.output))

    def test_pagination_cannot_be_overridden_by_client(self):
        self.login()
        Employee.objects.bulk_create([Employee(business=self.business, first_name='Synthetic', last_name=str(i)) for i in range(51)])
        response = self.client.get(f'/api/v1/businesses/{self.business.pk}/employees/?page_size=999999')
        self.assertEqual(len(response.data['results']), 50)
        self.assertEqual(response.data['count'], 51)

    @override_settings(SECURE_SSL_REDIRECT=True, SECURE_HSTS_SECONDS=31536000, SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
    def test_https_redirect_and_hsts(self):
        self.assertEqual(self.client.get('/api/v1/auth/csrf/').status_code, 301)
        response = self.client.get('/api/v1/auth/csrf/', secure=True)
        self.assertEqual(response['Strict-Transport-Security'], 'max-age=31536000')
        self.assertTrue(response.cookies['csrftoken']['secure'])
