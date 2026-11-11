"""Bounded, low-cardinality telemetry: no URL, UUID, query, body, IP or GPS."""

import ipaddress
import json
import logging
import time
from datetime import datetime, timezone

from django.conf import settings

logger = logging.getLogger("zenvik.http")
EVENTS = {
    "http_request",
    "api_rejected",
    "api_input_rejected",
    "api_internal_error",
    "turnstile_unavailable",
    "turnstile_rejected",
}


class SafeJSONFormatter(logging.Formatter):
    def format(self, record):
        event = str(record.msg).split()[0] if record.msg else "event"
        if event not in EVENTS:
            event = "framework_event"
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "api",
            "level": record.levelname,
            "event": event,
        }
        for name in ("status_code", "duration_ms", "method", "family"):
            value = getattr(record, name, None)
            if name in ("status_code", "duration_ms") and isinstance(
                value, (int, float)
            ):
                payload[name] = value
            if name == "method" and value in (
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "HEAD",
                "OPTIONS",
            ):
                payload[name] = value
            if name == "family" and value in (
                "auth",
                "businesses",
                "attendance",
                "billing",
                "health",
                "other",
            ):
                payload[name] = value
        if record.exc_info and record.exc_info[0]:
            payload["error_type"] = record.exc_info[0].__name__
        return json.dumps(payload, separators=(",", ":"))


class TrustedProxyMiddleware:
    """Only explicitly trusted *network peers* may supply X-Forwarded-Proto.

    Never use X-Forwarded-For to determine trust or user identity. The public
    ingress and Next must overwrite forwarding headers; Django stays private.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            peer = ipaddress.ip_address(request.META.get("REMOTE_ADDR", ""))
            trusted = settings.BEHIND_PROXY and any(
                peer in ipaddress.ip_network(cidr)
                for cidr in settings.TRUSTED_PROXY_CIDRS
            )
        except ValueError:
            trusted = False
        if not trusted:
            request.META.pop("HTTP_X_FORWARDED_PROTO", None)
        request.META.pop("HTTP_FORWARDED", None)
        request.META.pop("HTTP_X_FORWARDED_FOR", None)
        request.META.pop("HTTP_X_FORWARDED_HOST", None)
        return self.get_response(request)


class RequestTelemetryMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        if settings.STRUCTURED_LOGGING:
            family = "other"
            for candidate in ("auth", "attendance", "billing", "businesses", "health"):
                if f"/{candidate}/" in request.path:
                    family = candidate
                    break
            logger.info(
                "http_request",
                extra={
                    "method": request.method,
                    "status_code": response.status_code,
                    "duration_ms": round((time.monotonic() - start) * 1000, 2),
                    "family": family,
                },
            )
        return response
