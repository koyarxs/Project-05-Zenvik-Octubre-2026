from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def validate_turnstile_configuration(*, enabled, production, site_key, secret_key, hostnames):
    if not enabled:
        return
    if not site_key or not secret_key or not hostnames:
        raise ImproperlyConfigured('Turnstile requires a site key, secret key and explicit allowed hostnames.')
    if any(not host or '*' in host or '/' in host or ':' in host for host in hostnames):
        raise ImproperlyConfigured('Turnstile requires exact allowed hostnames without schemes, paths or ports.')
    if production and any(value.startswith(('1x0000', '2x0000', '3x0000')) for value in (site_key, secret_key)):
        raise ImproperlyConfigured('Turnstile test keys must not be used in production.')


def validate_production(*, debug, hosts, secret, origins):
    """Fail closed on known unsafe deployment settings; never include secret values."""
    if debug:
        raise ImproperlyConfigured('Production requires DEBUG=False.')
    if not hosts or any(host == '*' or host.startswith('.') or '://' in host for host in hosts):
        raise ImproperlyConfigured('Production requires explicit ALLOWED_HOSTS.')
    if len(secret) < 50 or len(set(secret)) < 5 or secret.startswith(('django-insecure-', 'REPLACE_')):
        raise ImproperlyConfigured('Production requires a strong, unique DJANGO_SECRET_KEY.')
    for origin in origins:
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.netloc or '*' in origin or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise ImproperlyConfigured('Production CSRF_TRUSTED_ORIGINS must be explicit HTTPS origins without paths.')
