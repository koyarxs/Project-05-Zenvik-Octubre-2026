from datetime import timedelta
from math import ceil

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import Throttled

from .models import AuthRateLimit


def reserve_auth_attempt(scopes):
    """Reserve before hashing passwords. Row locks share limits across workers."""
    now = timezone.now()
    buckets = sorted(
        (salted_hmac('zenvik.auth.limit', identity, algorithm='sha256').hexdigest(), limit, seconds)
        for identity, limit, seconds in scopes
    )
    wait = 0
    with transaction.atomic():
        for key, limit, seconds in buckets:
            bucket, _ = AuthRateLimit.objects.select_for_update().get_or_create(
                key=key, defaults={'expires_at': now + timedelta(seconds=seconds)}
            )
            if bucket.expires_at <= now:
                bucket.attempts = 0
                bucket.expires_at = now + timedelta(seconds=seconds)
            if bucket.attempts >= limit:
                wait = max(wait, ceil((bucket.expires_at - now).total_seconds()))
            else:
                bucket.attempts += 1
                bucket.save(update_fields=['attempts', 'expires_at'])
    if wait:
        raise Throttled(wait=wait, detail='Demasiados intentos. Inténtalo más tarde.')
