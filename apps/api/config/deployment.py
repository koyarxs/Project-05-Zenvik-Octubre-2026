from urllib.parse import urlsplit
import ipaddress

from django.core.exceptions import ImproperlyConfigured


def validate_registration_email(*, enabled, production, origin, smtp_host, sender):
    if not enabled:
        return
    parsed = urlsplit(origin)
    schemes = ('https',) if production else ('https', 'http')
    if (parsed.scheme not in schemes or not parsed.hostname or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment):
        raise ImproperlyConfigured('REGISTRATION_WEB_ORIGIN must be a web origin without credentials or a path.')
    if production and (not smtp_host or smtp_host == 'localhost' or not sender or '@localhost' in sender):
        raise ImproperlyConfigured('Public email verification requires a configured SMTP host and sender.')


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


def validate_infrastructure(*, environment, behind_proxy, trusted_cidrs, sslmode):
    if environment not in ('staging', 'production'):
        raise ImproperlyConfigured('Secure deployments require staging or production environment.')
    if sslmode != 'verify-full':
        raise ImproperlyConfigured('Secure deployments require POSTGRES_SSLMODE=verify-full and a trusted CA.')
    if behind_proxy and not trusted_cidrs:
        raise ImproperlyConfigured('Configure the exact private proxy peers before trusting forwarded headers.')
    for cidr in trusted_cidrs:
        try:
            network = ipaddress.ip_network(cidr)
            if network.prefixlen == 0:
                raise ValueError()
        except ValueError:
            raise ImproperlyConfigured('TRUSTED_PROXY_CIDRS requires explicit restricted CIDRs.') from None


def validate_environment(*, environment, production, read_dotenv):
    if environment not in ('development', 'staging', 'production'):
        raise ImproperlyConfigured('Unknown APP_ENVIRONMENT.')
    if environment in ('staging', 'production') and not production:
        raise ImproperlyConfigured('Staging and production require secure Django production settings.')
    if production and read_dotenv:
        raise ImproperlyConfigured('Secure deployments require DJANGO_READ_DOTENV=False and injected secrets.')
