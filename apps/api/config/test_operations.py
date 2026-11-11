import io
import json
import logging
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.db import OperationalError
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

from config.deployment import validate_infrastructure, validate_environment
from config.observability import SafeJSONFormatter, TrustedProxyMiddleware


class InfrastructureConfigurationTests(SimpleTestCase):
    def test_environment_cannot_silently_fall_back_to_development_or_dotenv(self):
        validate_environment(
            environment="development", production=False, read_dotenv=True
        )
        validate_environment(environment="staging", production=True, read_dotenv=False)
        for environment, production, read_dotenv in [
            ("production", False, False),
            ("staging", False, False),
            ("production", True, True),
            ("typo", True, False),
        ]:
            with self.assertRaises(ImproperlyConfigured):
                validate_environment(
                    environment=environment,
                    production=production,
                    read_dotenv=read_dotenv,
                )

    @override_settings(
        PRODUCTION=True,
        APP_ENVIRONMENT="staging",
        BILLING_PAYMENT_MODE="flow_sandbox",
        FLOW_SANDBOX_API_KEY="synthetic-sandbox-key",
        FLOW_SANDBOX_SECRET_KEY="synthetic-sandbox-secret",
        FLOW_SANDBOX_CONFIRMATION_URL="https://staging.example.invalid/callback",
        FLOW_SANDBOX_RETURN_URL="https://staging.example.invalid/return",
    )
    def test_secure_staging_can_prepare_only_sandbox_payment_adapter(self):
        from billing.providers import provider, checkout_available

        self.assertEqual(provider().name, "flow_sandbox")
        self.assertTrue(checkout_available())
        with override_settings(APP_ENVIRONMENT="production"):
            from billing.providers import ProviderUnavailable

            self.assertFalse(checkout_available())
            with self.assertRaises(ProviderUnavailable):
                provider()

    def test_secure_infrastructure_rejects_unverified_database_and_open_proxy(self):
        valid = dict(
            environment="staging",
            behind_proxy=True,
            trusted_cidrs=["192.0.2.10/32"],
            sslmode="verify-full",
        )
        validate_infrastructure(**valid)
        for changes in [
            dict(environment="development"),
            dict(sslmode="require"),
            dict(sslmode="prefer"),
            dict(trusted_cidrs=[]),
            dict(trusted_cidrs=["0.0.0.0/0"]),
            dict(trusted_cidrs=["::/0"]),
            dict(trusted_cidrs=["bad"]),
        ]:
            with self.subTest(changes=changes), self.assertRaises(ImproperlyConfigured):
                validate_infrastructure(**{**valid, **changes})

    @override_settings(
        BEHIND_PROXY=True,
        TRUSTED_PROXY_CIDRS=["192.0.2.10/32"],
        SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
    )
    def test_untrusted_peer_cannot_spoof_secure_scheme(self):
        observed = []

        def view(request):
            observed.append((request.is_secure(), dict(request.META)))
            return HttpResponse()

        middleware = TrustedProxyMiddleware(view)
        for peer in ["198.51.100.2", "192.0.2.10"]:
            request = RequestFactory().get(
                "/",
                REMOTE_ADDR=peer,
                HTTP_X_FORWARDED_PROTO="https",
                HTTP_X_FORWARDED_FOR="192.0.2.10",
                HTTP_X_FORWARDED_HOST="fake.test",
            )
            middleware(request)
        self.assertFalse(observed[0][0])
        self.assertTrue(observed[1][0])
        self.assertNotIn("HTTP_X_FORWARDED_FOR", observed[1][1])
        self.assertNotIn("HTTP_X_FORWARDED_HOST", observed[1][1])

    def test_structured_formatter_discards_payload_and_exception_messages(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(SafeJSONFormatter())
        record = logging.LogRecord(
            "zenvik",
            logging.ERROR,
            "private-file",
            1,
            "api_rejected secret=private-sentinel-gps-password",
            (),
            None,
        )
        record.status_code = 403
        record.duration_ms = 1.5
        record.url = "/api/private-sentinel?token=secret"
        record.family = "attendance"
        handler.handle(record)
        text = stream.getvalue()
        self.assertNotIn("private-sentinel", text)
        self.assertNotIn("password", text)
        self.assertEqual(json.loads(text)["status_code"], 403)
        record.msg = "private_sentinel"
        self.assertNotIn("private_sentinel", SafeJSONFormatter().format(record))


class HealthTests(TestCase):
    def test_liveness_never_queries_database(self):
        with self.assertNumQueries(0):
            response = self.client.get("/health/live/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "api"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_readiness_checks_database_without_details(self):
        response = self.client.get("/health/ready/")
        self.assertEqual(response.status_code, 200)
        with patch(
            "config.health.connection.cursor",
            side_effect=OperationalError("private-sentinel-db-password"),
        ):
            failed = self.client.get("/health/ready/")
        self.assertEqual(failed.status_code, 503)
        self.assertNotIn("private-sentinel", failed.content.decode())
        self.assertEqual(failed.json(), {"status": "unavailable"})

    def test_probes_are_read_only(self):
        self.assertEqual(self.client.post("/health/live/", {}).status_code, 405)
        self.assertEqual(self.client.post("/health/ready/", {}).status_code, 405)

    @override_settings(
        SECURE_SSL_REDIRECT=True, SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True
    )
    def test_https_cookies_remain_secure_and_private_health_is_probeable(self):
        response = self.client.get("/api/v1/auth/csrf/", secure=True)
        self.assertTrue(response.cookies["csrftoken"]["secure"])
        self.assertTrue(response.cookies["csrftoken"]["httponly"])
        self.assertEqual(self.client.get("/health/live/").status_code, 200)
