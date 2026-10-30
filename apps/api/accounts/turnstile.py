import json
import logging
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework.exceptions import APIException, ValidationError

logger = logging.getLogger('zenvik.security')
SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'


class TurnstileUnavailable(APIException):
    status_code = 503
    default_detail = 'La verificación de seguridad no está disponible. Inténtalo nuevamente.'
    default_code = 'turnstile_unavailable'


def verify_turnstile(token, action):
    if not settings.TURNSTILE_ENABLED:
        return
    if not isinstance(token, str) or not token.strip() or len(token) > 2048:
        raise ValidationError({'turnstile_token': 'Completa la verificación de seguridad.'})
    # Only the challenge token is sent, never credentials, account data or cookies.
    body = json.dumps({'secret': settings.TURNSTILE_SECRET_KEY, 'response': token}).encode()
    request = Request(SITEVERIFY_URL, data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(request, timeout=5) as response:
            payload = response.read(16385)
        if len(payload) > 16384:
            raise ValueError('Unexpected verification response size')
        result = json.loads(payload)
        if not isinstance(result, dict):
            raise ValueError('Unexpected verification response type')
    except (URLError, OSError, ValueError, UnicodeError):
        logger.warning('turnstile_unavailable')
        raise TurnstileUnavailable() from None
    hostname = result.get('hostname')
    if (result.get('success') is not True or result.get('action') != action
            or not isinstance(hostname, str)
            or hostname.lower() not in settings.TURNSTILE_ALLOWED_HOSTNAMES):
        logger.warning('turnstile_rejected')
        raise ValidationError({'turnstile_token': 'La verificación no es válida o expiró. Complétala nuevamente.'})
