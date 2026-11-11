from django.utils import timezone
from rest_framework import serializers
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from accounts.services import reserve_auth_attempt
from businesses.permissions import active_membership
from config.api import StrictInputMixin
from .access import rights, usage
from .models import Plan, Price
from .providers import checkout_available, provider
from .services import change_subscription, confirm_payment, get_subscription, owner, start_checkout


def price_data(price):
    return {'id': str(price.pk), 'amount': price.amount, 'currency': price.currency,
            'interval': price.interval, 'effective_at': price.effective_at}


def catalog():
    now = timezone.now()
    result = []
    for plan in Plan.objects.filter(published=True).prefetch_related('versions__prices'):
        versions = [v for v in plan.versions.all() if v.effective_at <= now]
        if not versions:
            continue
        version = max(versions, key=lambda v: v.number)
        result.append({'id': str(plan.pk), 'code': plan.code, 'name': plan.name,
            'description': plan.description, 'version_id': str(version.pk), 'version': version.number,
            'features': version.features, 'limits': version.limits, 'trial_days': version.trial_days,
            'prices': [price_data(p) for p in version.prices.all() if p.published and p.effective_at <= now]})
    return result


class CatalogView(GenericAPIView):
    permission_classes = [AllowAny]

    def get(self, request):
        reserve_auth_attempt([(f'billing:catalog:{request.META.get("REMOTE_ADDR", "")}', 120, 60)])
        return Response({'plans': catalog(), 'checkout_enabled': checkout_available(),
            'payment_environment': 'sandbox' if checkout_available() else 'disabled'})


class OwnerView(GenericAPIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        membership = active_membership(request.user, kwargs['business_id'])
        owner(request.user, kwargs['business_id'])
        self.business = membership.business
        reserve_auth_attempt([(f'billing:{request.user.pk}:{self.business.pk}:{request.method}', 120 if request.method == 'GET' else 20, 60)])


class SubscriptionView(OwnerView):
    def get(self, request, **kwargs):
        sub = get_subscription(self.business.pk)
        access = rights(self.business)
        return Response({'id': str(sub.pk), 'legacy_access': sub.legacy_access,
            'state': sub.state, 'revision': sub.revision,
            'plan': sub.version.plan.name if sub.version else None,
            'version_id': str(sub.version_id) if sub.version_id else None,
            'price': price_data(sub.price) if sub.price else None,
            'period_start': sub.period_start, 'period_end': sub.period_end,
            'cancel_at_period_end': sub.cancel_at_period_end,
            'features': access['features'], 'limits': access['limits'], 'writable': access['writable'],
            'usage': usage(self.business), 'checkout_enabled': checkout_available(),
            'changes': list(sub.changes.order_by('-created_at').values('id', 'action', 'effective_at', 'applied')[:20])})


class PaymentsView(OwnerView):
    def get(self, request, **kwargs):
        sub = get_subscription(self.business.pk)
        page = self.paginate_queryset(sub.orders.all())
        return self.get_paginated_response([{'id': str(p.pk), 'amount': p.amount, 'currency': p.currency,
            'state': p.state, 'provider': p.provider, 'period_start': p.period_start, 'period_end': p.period_end,
            'paid_at': p.paid_at, 'created_at': p.created_at} for p in page])


class CheckoutInput(StrictInputMixin, serializers.Serializer):
    price_id = serializers.UUIDField()
    request_id = serializers.UUIDField()
    expected_revision = serializers.IntegerField(min_value=0)


class CheckoutView(OwnerView):
    def post(self, request, **kwargs):
        serializer = CheckoutInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        order, url = start_checkout(request.user, self.business.pk, serializer.validated_data)
        return Response({'order_id': str(order.pk), 'checkout_url': url, 'environment': 'sandbox'}, status=201)


class ChangeInput(StrictInputMixin, serializers.Serializer):
    action = serializers.ChoiceField(choices=['TRIAL', 'CHANGE', 'CANCEL', 'REACTIVATE'])
    request_id = serializers.UUIDField()
    expected_revision = serializers.IntegerField(min_value=0)
    price_id = serializers.UUIDField(required=False, allow_null=True)
    version_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, data):
        if data['action'] == 'CHANGE' and not data.get('price_id'):
            raise serializers.ValidationError('Selecciona un precio publicado.')
        if data['action'] == 'TRIAL' and not data.get('version_id'):
            raise serializers.ValidationError('Selecciona un plan con prueba habilitada.')
        if data['action'] != 'CHANGE' and data.get('price_id') or data['action'] != 'TRIAL' and data.get('version_id'):
            raise serializers.ValidationError('Campos incompatibles con la acción.')
        return data


class ChangeView(OwnerView):
    def post(self, request, **kwargs):
        serializer = ChangeInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        sub = change_subscription(request.user, self.business.pk, **serializer.validated_data)
        return Response({'id': str(sub.pk), 'state': sub.state, 'revision': sub.revision})


class FlowCallbackView(GenericAPIView):
    # Provider identity is verified via signed server-to-server getStatus, not browser/session.
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        reserve_auth_attempt([(f'billing:callback:{request.META.get("REMOTE_ADDR", "")}', 120, 60)])
        token = request.data.get('token')
        if not isinstance(token, str) or not token or len(token) > 512 or set(request.data) != {'token'}:
            raise serializers.ValidationError('Notificación no válida.')
        gateway = provider()
        result = gateway.verify(token)
        confirm_payment(result, gateway.name)
        return Response({'received': True})
