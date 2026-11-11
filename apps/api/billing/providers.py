"""Payment transport. Only Flow SANDBOX is reachable; production is deliberately absent."""
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import hmac
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, HTTPRedirectHandler, build_opener

from django.conf import settings
from rest_framework.exceptions import APIException


class ProviderUnavailable(APIException):
    status_code = 503
    default_detail = 'Los pagos no están habilitados. No se realizó ningún cobro.'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class VerifiedPayment:
    order_id: str
    reference: str
    event_key: str
    amount: int
    currency: str
    status: str


class FlowSandbox:
    name = 'flow_sandbox'
    base_url = 'https://sandbox.flow.cl/api'

    def __init__(self):
        if not settings.FLOW_SANDBOX_API_KEY or not settings.FLOW_SANDBOX_SECRET_KEY:
            raise ProviderUnavailable()

    @staticmethod
    def signature(params, secret):
        message = ''.join(f'{key}{params[key]}' for key in sorted(params))
        return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()

    def call(self, endpoint, params, method='GET'):
        params = {'apiKey': settings.FLOW_SANDBOX_API_KEY, **params}
        params['s'] = self.signature(params, settings.FLOW_SANDBOX_SECRET_KEY)
        query = urlencode(params)
        request = Request(f'{self.base_url}/{endpoint}' + ('?' + query if method == 'GET' else ''),
                          data=query.encode() if method == 'POST' else None, method=method,
                          headers={'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            # Never log request URLs: signed GET query strings contain credentials.
            with build_opener(NoRedirect()).open(request, timeout=10) as response:
                if response.url.split('?')[0] != request.full_url.split('?')[0]:
                    raise ProviderUnavailable()
                raw = response.read(65537)
                if len(raw) > 65536:
                    raise ProviderUnavailable()
                result = json.loads(raw)
                if not isinstance(result, dict):
                    raise ProviderUnavailable()
                return result
        except (HTTPError, URLError, TimeoutError, ValueError, OSError):
            raise ProviderUnavailable() from None

    def verify(self, token):
        data = self.call('payment/getStatus', {'token': token})
        try:
            amount = Decimal(str(data['amount']))
            if amount != amount.to_integral_value():
                raise ValueError()
            reference = str(data['flowOrder'])
            status = {1: 'PENDING', 2: 'PAID', 3: 'FAILED', 4: 'FAILED'}[int(data['status'])]
            return VerifiedPayment(str(data['commerceOrder']), reference,
                                   f'{reference}:{data["status"]}', int(amount), data['currency'], status)
        except (KeyError, TypeError, ValueError):
            raise ProviderUnavailable() from None

    def checkout(self, order, email):
        data = self.call('payment/create', {'commerceOrder': str(order.pk), 'subject': 'Suscripción Zenvik - sandbox',
            'currency': order.currency, 'amount': order.amount, 'email': email,
            'urlConfirmation': settings.FLOW_SANDBOX_CONFIRMATION_URL,
            'urlReturn': settings.FLOW_SANDBOX_RETURN_URL}, method='POST')
        # Hosted checkout, no card data enters Zenvik. Native automatic recurrence is separate.
        url, token = data.get('url', ''), data.get('token', '')
        if not url.startswith('https://sandbox.flow.cl/') or not isinstance(token, str) or not token:
            raise ProviderUnavailable()
        return f'{url}?{urlencode({"token": token})}'


def provider():
    if settings.BILLING_PAYMENT_MODE == 'flow_sandbox' and (not settings.PRODUCTION or settings.APP_ENVIRONMENT == 'staging'):
        return FlowSandbox()
    raise ProviderUnavailable()


def checkout_available():
    return bool((not settings.PRODUCTION or settings.APP_ENVIRONMENT == 'staging') and settings.BILLING_PAYMENT_MODE == 'flow_sandbox'
                and settings.FLOW_SANDBOX_API_KEY and settings.FLOW_SANDBOX_SECRET_KEY
                and settings.FLOW_SANDBOX_CONFIRMATION_URL and settings.FLOW_SANDBOX_RETURN_URL)
