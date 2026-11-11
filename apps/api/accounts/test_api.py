from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import StringIO
from time import time
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core import mail, signing
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import Throttled
from rest_framework.test import APIClient
from businesses.models import Business, Membership

from .models import AuthRateLimit
from .registration_email import TOKEN_LIFETIME, TOKEN_SALT
from .services import reserve_auth_attempt
from .session_activity import IDLE_SECONDS, LAST_ACTIVITY, LAST_SEEN, PRESENCE_SECONDS

User = get_user_model()
PASSWORD = 'Zenvik-test!pass-9274'
ROOT = '/api/v1/auth/'


@override_settings(TURNSTILE_ENABLED=False)
class AuthAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username='ana', email='ana@example.com', password=PASSWORD)

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.token = self.client.get(ROOT + 'csrf/').data['csrfToken']
        self.client.credentials(HTTP_X_CSRFTOKEN=self.token)

    def login(self, **extra):
        response = self.client.post(ROOT + 'login/', {'username': 'ana', 'password': PASSWORD}, format='json', **extra)
        if response.status_code == 200:
            self.client.credentials(HTTP_X_CSRFTOKEN=response.data['csrfToken'])
        return response

    def test_register_hashes_password_and_does_not_login(self):
        response = self.client.post(ROOT + 'register/', {
            'username': 'new-user', 'email': 'NEW@example.com', 'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(response.data), {'id', 'username', 'email'})
        user = User.objects.get(username='new-user')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)
        self.assertFalse(user.is_staff or user.is_superuser)
        self.assertEqual(self.client.get(ROOT + 'me/').status_code, 403)

    def test_registration_rejects_duplicate_email_case_insensitively(self):
        response = self.client.post(ROOT + 'register/', {
            'username': 'new-user', 'email': 'ANA@example.com', 'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(User.objects.count(), 1)

    def test_registration_creates_owned_business_and_rolls_back_invalid_business(self):
        account = {
            'username': 'new-owner', 'email': 'owner@example.com', 'password': PASSWORD,
            'first_name': 'Ana', 'last_name': 'Prueba', 'phone': '+56912345678',
        }
        business = {'name': 'Taller', 'region': 'Los Lagos', 'commune': 'Castro', 'locality': 'Castro',
                    'team_size': 8, 'primary_location': 'Casa matriz'}
        invalid = self.client.post(ROOT + 'register/', {**account, 'business': {**business, 'rut': 'inválido'}}, format='json')
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(User.objects.filter(username=account['username']).exists())
        created = self.client.post(ROOT + 'register/', {
            **account, 'business': business, 'start_session': True,
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        user = User.objects.get(username=account['username'])
        self.assertEqual((user.first_name, user.last_name, user.phone), ('Ana', 'Prueba', '+56912345678'))
        workspace = Business.objects.get(pk=created.data['business_id'])
        self.assertEqual((workspace.team_size, workspace.primary_location), (8, 'Casa matriz'))
        self.assertEqual(workspace.locality, 'Castro')
        self.assertTrue(Membership.objects.filter(user=user, business=workspace, role=Membership.Role.OWNER).exists())
        session = self.client.get(ROOT + 'me/')
        self.assertEqual(session.status_code, 200)
        self.assertEqual(session.data['id'], str(user.pk))
        self.assertFalse(session.data['is_platform_admin'])

    def test_registration_rejects_weak_password_and_privilege_fields(self):
        for extra in ({'password': 'short-1234'}, {'is_staff': True}, {'is_superuser': True}, {'role': 'OWNER'}):
            with self.subTest(extra=extra):
                response = self.client.post(ROOT + 'register/', {
                    'username': 'new-user', 'email': 'new@example.com', 'password': PASSWORD, **extra,
                }, format='json')
                self.assertEqual(response.status_code, 400)

    @override_settings(REGISTRATION_VERIFY_EMAIL=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_registration_requires_email_proof_before_creating_account(self):
        account = {'username': 'new-user', 'email': 'new@example.com', 'password': PASSWORD}
        self.assertEqual(self.client.post(ROOT + 'register/', account, format='json').status_code, 400)
        response = self.client.post(ROOT + 'registration-email/', {'email': account['email']}, format='json')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(username=account['username']).exists())
        self.assertEqual(mail.outbox[0].to, [account['email']])
        link = next(line for line in mail.outbox[0].body.splitlines() if '/registrarse#' in line)
        token = parse_qs(urlsplit(link).fragment)['verificar'][0]
        with patch('django.core.signing.time.time', return_value=time() + TOKEN_LIFETIME + 1):
            expired = self.client.post(ROOT + 'register/', {**account, 'email_verification': token}, format='json')
        self.assertEqual(expired.status_code, 400)
        wrong_token = signing.dumps('other@example.com', salt=TOKEN_SALT)
        mismatch = self.client.post(ROOT + 'register/', {**account, 'email_verification': wrong_token}, format='json')
        self.assertEqual(mismatch.status_code, 400)
        verified = {**account, 'email_verification': token}
        self.assertEqual(self.client.post(ROOT + 'register/', verified, format='json').status_code, 201)
        self.assertEqual(self.client.post(ROOT + 'register/', {**verified, 'username': 'another'}, format='json').status_code, 400)

    def test_login_me_logout_and_session_rotation(self):
        old_session = self.client.session.session_key
        response = self.login()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotEqual(self.client.session.session_key, old_session)
        self.assertNotEqual(response.data['csrfToken'], self.token)
        self.assertEqual(set(response.data['user']), {
            'id', 'username', 'email', 'is_platform_admin',
            'session_started_at', 'session_expires_at', 'session_server_time',
        })
        self.assertFalse(response.data['user']['is_platform_admin'])
        me = self.client.get(ROOT + 'me/')
        self.assertEqual(me.data['id'], str(self.user.pk))
        self.assertIn('no-store', me['Cache-Control'])
        self.assertTrue(response.cookies['sessionid']['httponly'])
        self.assertFalse(response.cookies['sessionid']['max-age'])
        self.assertEqual(response.cookies['sessionid']['samesite'], 'Lax')
        self.assertFalse(response.cookies['sessionid']['secure'])
        self.assertEqual(self.client.post(ROOT + 'logout/', {}, format='json').status_code, 204)
        self.assertEqual(self.client.get(ROOT + 'me/').status_code, 403)

    def test_session_activity_and_inactivity_expiry(self):
        login = self.login()
        started = login.data['user']['session_started_at']
        session = self.client.session
        session[LAST_ACTIVITY] = int(time()) - 120
        session.save()
        # Polling the API is not interaction and must not extend the session.
        me = self.client.get(ROOT + 'me/')
        self.assertEqual(me.data['session_expires_at'], session[LAST_ACTIVITY] + IDLE_SECONDS)
        activity = self.client.post(ROOT + 'session-activity/', {'interacted': True}, format='json')
        self.assertEqual(activity.data['session_started_at'], started)
        self.assertGreater(self.client.session[LAST_ACTIVITY], session[LAST_ACTIVITY])
        session = self.client.session
        session[LAST_ACTIVITY] = int(time()) - IDLE_SECONDS - 1
        session.save()
        self.assertEqual(self.client.post(ROOT + 'session-activity/', {'interacted': True}, format='json').status_code, 403)
        self.assertEqual(self.client.get(ROOT + 'me/').status_code, 403)

    def test_session_expires_after_last_visible_tab_stops_reporting(self):
        self.login()
        last_activity = self.client.session[LAST_ACTIVITY]
        presence = self.client.post(ROOT + 'session-activity/', {'interacted': False}, format='json')
        self.assertEqual(self.client.session[LAST_ACTIVITY], last_activity)
        self.assertEqual(presence.data['session_expires_at'], self.client.session[LAST_SEEN] + PRESENCE_SECONDS)
        session = self.client.session
        session[LAST_SEEN] = int(time()) - PRESENCE_SECONDS - 1
        session.save()
        self.assertEqual(self.client.get(ROOT + 'me/').status_code, 403)

    def test_platform_overview_requires_active_staff_superuser(self):
        endpoint = ROOT + 'platform-overview/'
        self.assertEqual(self.client.get(endpoint).status_code, 403)
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.get(endpoint).status_code, 403)
        self.user.is_staff = True
        self.user.save(update_fields=['is_staff'])
        self.assertEqual(self.client.get(endpoint).status_code, 403)
        self.user.is_superuser = True
        self.user.save(update_fields=['is_superuser'])
        self.assertTrue(self.client.get(ROOT + 'me/').data['is_platform_admin'])
        response = self.client.get(endpoint, {'q': 'ana'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['totals']['users'], 1)
        self.assertEqual(response.data['users'][0]['username'], 'ana')
        self.assertIn('no-store', response['Cache-Control'])
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.assertEqual(self.client.get(endpoint).status_code, 403)

    def test_invalid_and_inactive_credentials_have_same_response(self):
        responses = []
        for name in ('ana', 'unknown'):
            response = self.client.post(ROOT + 'login/', {'username': name, 'password': 'wrong'}, format='json')
            self.assertEqual(response.status_code, 403)
            responses.append(response.data)
        self.user.is_active = False
        self.user.save()
        response = self.login()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(responses[0], responses[1])
        self.assertEqual(response.data, responses[0])

    def test_csrf_required_for_anonymous_login_and_register(self):
        self.client.credentials()
        for endpoint in ('login/', 'register/'):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(ROOT + endpoint, {
                    'username': 'new-user', 'email': 'new@example.com', 'password': PASSWORD,
                }, format='json')
                self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.count(), 1)

    def test_logout_requires_csrf_and_post(self):
        self.login()
        self.assertEqual(self.client.get(ROOT + 'logout/').status_code, 405)
        self.client.credentials()
        self.assertEqual(self.client.post(ROOT + 'logout/', {}, format='json').status_code, 403)
        self.assertEqual(self.client.get(ROOT + 'me/').status_code, 200)

    def test_bad_origin_rejected_even_with_valid_token(self):
        self.assertEqual(self.login(HTTP_ORIGIN='https://untrusted.example').status_code, 403)

    def test_old_csrf_token_rejected_after_login(self):
        self.login()
        self.client.credentials(HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(self.client.post(ROOT + 'logout/', {}, format='json').status_code, 403)

    def test_login_account_limit_and_expiry(self):
        for index in range(5):
            response = self.client.post(ROOT + 'login/', {'username': 'ana', 'password': 'wrong'}, format='json', REMOTE_ADDR=f'192.0.2.{index + 1}')
            self.assertEqual(response.status_code, 403)
        response = self.login(REMOTE_ADDR='192.0.2.100')
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response['Retry-After']), 0)
        with patch('accounts.services.timezone.now', return_value=timezone.now() + timedelta(minutes=16)):
            self.assertEqual(self.login().status_code, 200)
        for key in AuthRateLimit.objects.values_list('key', flat=True):
            self.assertEqual(len(key), 64)
            self.assertNotIn('ana', key)

    def test_login_ip_limit_cannot_be_bypassed_with_forwarded_header(self):
        # Reserve the same shared bucket used by the endpoint without 30 password hashes.
        for _ in range(30):
            reserve_auth_attempt([('login:ip:127.0.0.1', 30, 900)])
        self.assertEqual(self.login(HTTP_X_FORWARDED_FOR='192.0.2.99').status_code, 429)

    def test_registration_rate_limited(self):
        for _ in range(10):
            reserve_auth_attempt([('register:ip:127.0.0.1', 10, 3600)])
        response = self.client.post(ROOT + 'register/', {
            'username': 'new-user', 'email': 'new@example.com', 'password': PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, 429)

    def test_cleanup_only_removes_expired_buckets(self):
        reserve_auth_attempt([('expired', 5, 900)])
        with patch('accounts.services.timezone.now', return_value=timezone.now() + timedelta(minutes=16)):
            reserve_auth_attempt([('current', 5, 900)])
        with patch('accounts.management.commands.purge_auth_limits.timezone.now', return_value=timezone.now() + timedelta(minutes=16)):
            call_command('purge_auth_limits', stdout=StringIO())
        self.assertEqual(AuthRateLimit.objects.count(), 1)

    @override_settings(SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True)
    def test_https_secure_cookie_flags(self):
        self.client = APIClient(enforce_csrf_checks=True)
        csrf = self.client.get(ROOT + 'csrf/', secure=True)
        self.assertTrue(csrf.cookies['csrftoken']['secure'])
        self.assertTrue(csrf.cookies['csrftoken']['httponly'])
        self.client.credentials(HTTP_X_CSRFTOKEN=csrf.data['csrfToken'])
        response = self.login(secure=True, HTTP_ORIGIN='https://testserver')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.cookies['sessionid']['secure'])


class AuthRateLimitConcurrencyTests(TransactionTestCase):
    def test_parallel_attempts_do_not_exceed_limit(self):
        def attempt(_):
            close_old_connections()
            try:
                reserve_auth_attempt([('parallel-account', 5, 900)])
                return True
            except Throttled:
                return False
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(12)))
        self.assertEqual(sum(results), 5)
        self.assertEqual(AuthRateLimit.objects.get().attempts, 5)
