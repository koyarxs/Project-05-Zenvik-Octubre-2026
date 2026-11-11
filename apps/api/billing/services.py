import calendar
from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from businesses.models import Business
from businesses.permissions import active_membership
from .models import BillingAudit, PaymentOrder, PlanVersion, Price, ProviderEvent, Subscription, SubscriptionChange
from .providers import VerifiedPayment, provider


class Conflict(APIException):
    status_code = 409
    default_detail = 'La suscripción cambió. Actualiza antes de continuar.'


def period_end(start, interval):
    months = 12 if interval == 'YEAR' else 1
    month_index = start.year * 12 + start.month - 1 + months
    year, month0 = divmod(month_index, 12)
    return start.replace(year=year, month=month0 + 1, day=min(start.day, calendar.monthrange(year, month0 + 1)[1]))


def audit(sub, actor, action, resource_id=None, **metadata):
    return BillingAudit.objects.create(subscription=sub, actor=actor, action=action,
        resource_id=resource_id or sub.pk, metadata=metadata)


def owner(user, business_id):
    if active_membership(user, business_id).role != 'OWNER':
        raise PermissionDenied('Solo el propietario puede administrar la suscripción.')


def current_price(price_id):
    now = timezone.now()
    return get_object_or_404(Price.objects.select_related('version__plan'), pk=price_id,
        published=True, version__plan__published=True, effective_at__lte=now, version__effective_at__lte=now)


def apply_paid_order(sub, order):
    sub.price = order.price
    sub.version = order.price.version
    sub.legacy_access = False
    sub.state = 'ACTIVE'
    sub.period_start, sub.period_end = order.period_start, order.period_end
    sub.cancel_at_period_end = False
    sub.revision += 1
    sub.save()
    sub.changes.filter(action='CHANGE', price=order.price, applied=False).update(applied=True)
    audit(sub, None, 'PAYMENT_APPLIED', order.pk, revision=sub.revision)


def advance(sub):
    """Caller holds business lock. No renewal ever happens without a verified PAID order."""
    now = timezone.now()
    if sub.legacy_access or not sub.period_end or now < sub.period_end:
        return sub
    if sub.cancel_at_period_end:
        if sub.state != 'CANCELLED':
            sub.state = 'CANCELLED'
            sub.revision += 1
            sub.save()
            audit(sub, None, 'CANCELLATION_EFFECTIVE')
        return sub
    paid = sub.orders.select_related('price__version').filter(state='PAID',
        expected_revision=sub.revision, period_start=sub.period_end, period_end__gt=now).first()
    if paid:
        apply_paid_order(sub, paid)
    elif sub.state not in ('EXPIRED', 'SUSPENDED', 'CANCELLED'):
        sub.state = 'EXPIRED'
        # Keep revision stable so a delayed valid payment can reactivate the reserved period.
        sub.save(update_fields=['state'])
        audit(sub, None, 'PERIOD_EXPIRED')
    return sub


@transaction.atomic
def get_subscription(business_id):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    sub, _ = Subscription.objects.select_related('version__plan', 'price').get_or_create(business=business)
    return advance(sub)


@transaction.atomic
def order_payment(user, business_id, price_id, request_id, expected_revision):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    owner(user, business_id)
    sub = advance(Subscription.objects.get_or_create(business=business)[0])
    existing = sub.orders.filter(request_id=request_id).first()
    if existing:
        if existing.price_id != price_id:
            raise Conflict('La clave de reintento ya corresponde a otro precio.')
        return existing
    if sub.revision != expected_revision or sub.state == 'SUSPENDED':
        raise Conflict()
    gateway = provider()  # Fail closed before reserving anything if not configured.
    price = current_price(price_id)
    now = timezone.now()
    start = sub.period_end if not sub.legacy_access and sub.period_end and sub.period_end > now else now
    if sub.orders.filter(state='PENDING', expected_revision=sub.revision).exists():
        raise Conflict('Ya hay un pago pendiente. Revisa su estado antes de crear otro.')
    order = PaymentOrder.objects.create(subscription=sub, price=price, request_id=request_id,
        amount=price.amount, currency=price.currency, period_start=start, period_end=period_end(start, price.interval),
        expected_revision=sub.revision, provider=gateway.name)
    audit(sub, user, 'ORDER_CREATED', order.pk, price_id=str(price.pk))
    return order


def start_checkout(user, business_id, data):
    order = order_payment(user, business_id, **data)
    if order.state != 'PENDING':
        raise Conflict('Este pago ya fue procesado.')
    # Network request outside the DB lock. A transport failure leaves a stable internal order.
    # Flow has no guaranteed idempotency for payment/create: never automatically replay a timed-out call.
    with transaction.atomic():
        Business.objects.select_for_update().get(pk=business_id)
        owner(user, business_id)
        fresh = PaymentOrder.objects.get(pk=order.pk)
        if fresh.provider_reference:
            raise Conflict('El checkout ya se solicitó. Consulta su estado o contacta a soporte antes de reintentar.')
        fresh.provider_reference = 'CHECKOUT_REQUESTED'
        fresh.save(update_fields=['provider_reference'])
    url = provider().checkout(order, user.email)
    return order, url


@transaction.atomic
def confirm_payment(result, provider_name):
    if not isinstance(result, VerifiedPayment):
        raise ValidationError('Confirmación no verificada.')
    order_ref = get_object_or_404(PaymentOrder, pk=result.order_id, provider=provider_name)
    Business.objects.select_for_update().get(pk=order_ref.subscription.business_id)
    order = PaymentOrder.objects.select_related('price__version', 'subscription').get(pk=order_ref.pk)
    sub = order.subscription
    if result.amount != order.amount or result.currency != order.currency or not result.reference:
        raise ValidationError('La confirmación no coincide con la orden.')
    if order.provider_reference not in ('', 'CHECKOUT_REQUESTED', result.reference):
        raise ValidationError('La referencia no coincide con la orden.')
    event, created = ProviderEvent.objects.get_or_create(provider=provider_name, event_key=result.event_key,
        defaults={'order': order, 'status': result.status})
    if event.order_id != order.pk or event.status != result.status:
        raise Conflict('Evento de proveedor incompatible.')
    if not created or order.state == 'PAID':
        return order
    if result.status not in ('PAID', 'FAILED', 'PENDING'):
        raise ValidationError('Estado de proveedor desconocido.')
    order.provider_reference = result.reference
    order.state = result.status
    if result.status == 'PAID':
        order.paid_at = timezone.now()
        if sub.revision != order.expected_revision or sub.state == 'SUSPENDED' or sub.cancel_at_period_end:
            audit(sub, None, 'PAYMENT_REVIEW_REQUIRED', order.pk)
        elif order.period_start <= timezone.now() < order.period_end:
            apply_paid_order(sub, order)
        else:
            audit(sub, None, 'RENEWAL_PAYMENT_RESERVED', order.pk)
    elif result.status == 'FAILED' and sub.state == 'ACTIVE':
        sub.state = 'PAST_DUE'
        sub.save(update_fields=['state'])
    order.save(update_fields=['provider_reference', 'state', 'paid_at'])
    return order


@transaction.atomic
def change_subscription(user, business_id, action, request_id, expected_revision, price_id=None, version_id=None):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    owner(user, business_id)
    sub = advance(Subscription.objects.get_or_create(business=business)[0])
    old = sub.changes.filter(request_id=request_id).first()
    if old:
        if old.action != action or old.price_id != price_id or (action == 'TRIAL' and sub.version_id != version_id):
            raise Conflict('La clave ya corresponde a otra solicitud.')
        return sub
    if sub.revision != expected_revision:
        raise Conflict()
    price = None
    now = timezone.now()
    effective = sub.period_end if sub.period_end and sub.period_end > now else now
    applied = False
    if action == 'TRIAL':
        if sub.trial_used or sub.state in ('ACTIVE', 'TRIALING'):
            raise Conflict('El período de prueba no está disponible.')
        version = get_object_or_404(PlanVersion, pk=version_id, plan__published=True, effective_at__lte=now, trial_days__gt=0)
        sub.version = version
        sub.price = None
        sub.state = 'TRIALING'
        sub.legacy_access = False
        sub.trial_used = True
        sub.period_start, sub.period_end = now, now + timedelta(days=version.trial_days)
        effective, applied = now, True
    elif action == 'CHANGE':
        price = current_price(price_id)
        # A request schedules intent only. Paid rights change only after provider confirmation.
        if sub.changes.filter(action='CHANGE', applied=False).exists():
            raise Conflict('Ya existe un cambio solicitado. Contacta al operador para revisarlo.')
    elif action == 'CANCEL':
        if sub.legacy_access or sub.state not in ('ACTIVE', 'TRIALING', 'PAST_DUE'):
            raise Conflict('No hay una suscripción vigente para cancelar.')
        sub.cancel_at_period_end = True
    elif action == 'REACTIVATE':
        if sub.state not in ('ACTIVE', 'TRIALING', 'PAST_DUE') or not sub.cancel_at_period_end or not sub.period_end or sub.period_end <= now:
            raise Conflict('La reactivación requiere un nuevo pago o una cancelación aún no efectiva.')
        sub.cancel_at_period_end = False
        effective, applied = now, True
    else:
        raise ValidationError('Acción no permitida.')
    sub.revision += 1
    sub.save()
    change = SubscriptionChange.objects.create(subscription=sub, actor=user, request_id=request_id, action=action,
        price=price, effective_at=effective, applied=applied)
    audit(sub, user, action, change.pk, revision=sub.revision)
    return sub


@transaction.atomic
def operator_state(user, business_id, suspend):
    if not user.is_active or not user.is_staff or not user.has_perm('billing.operate_billing') or not user.has_perm('billing.change_subscription'):
        raise PermissionDenied('Se requiere autorización interna de facturación.')
    Business.objects.select_for_update().get(pk=business_id)
    sub = Subscription.objects.get(business_id=business_id)
    if sub.legacy_access:
        raise ValidationError('Este negocio conserva acceso previo; no tiene un contrato comercial que suspender.')
    previous = sub.state
    if suspend:
        sub.state = 'SUSPENDED'
    else:
        if sub.state != 'SUSPENDED' or not sub.period_end or sub.period_end <= timezone.now():
            raise Conflict('No hay un período vigente que reanudar.')
        paid = sub.orders.filter(state='PAID', period_start=sub.period_start, period_end=sub.period_end).exists()
        if not paid and sub.price_id:
            raise Conflict('Se requiere un pago confirmado para reanudar.')
        sub.state = 'ACTIVE' if paid else 'TRIALING'
    sub.revision += 1
    sub.save()
    audit(sub, user, 'OPERATOR_SUSPEND' if suspend else 'OPERATOR_RESUME', before=previous, after=sub.state)
    return sub
