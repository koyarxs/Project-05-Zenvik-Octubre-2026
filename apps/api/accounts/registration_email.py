import logging
from smtplib import SMTPException
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from rest_framework.exceptions import APIException, ValidationError

TOKEN_SALT = 'zenvik.registration.email.v1'
TOKEN_LIFETIME = 30 * 60


class RegistrationEmailUnavailable(APIException):
    status_code = 503
    default_detail = 'No pudimos enviar el correo. Inténtalo más tarde.'


def send_registration_email(email):
    token = signing.dumps(email, salt=TOKEN_SALT)
    url = f'{settings.REGISTRATION_WEB_ORIGIN}/registrarse#verificar={quote(token, safe="")}'
    try:
        sent = send_mail(
            'Confirma tu correo en Zenvik',
            f'Abre este enlace para crear tu cuenta en Zenvik. Caduca en 30 minutos.\n\n'
            f'{url}\n\nSi no solicitaste una cuenta, puedes ignorar este mensaje.',
            settings.DEFAULT_FROM_EMAIL,
            [email],
        )
    except (SMTPException, OSError):
        logging.getLogger('zenvik.security').warning('registration_email_delivery_failed')
        raise RegistrationEmailUnavailable() from None
    if not sent:
        raise RegistrationEmailUnavailable()


def require_verified_email(email, token):
    try:
        verified = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_LIFETIME)
    except signing.BadSignature:
        verified = None
    if verified != email.lower():
        raise ValidationError({'email_verification': 'El enlace no es válido o venció. Solicita otro.'})
