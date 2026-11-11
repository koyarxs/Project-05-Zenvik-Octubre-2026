"""Commercial identity is independent from workspace membership and roles."""
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

FEATURES = ('employees', 'shifts', 'leaves', 'worker_portal', 'attendance',
            'geolocation', 'geofences', 'reports', 'exports', 'incidents', 'notifications')
LIMITS = ('active_employees', 'active_sites', 'administrators')


class Record(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        abstract = True


class Plan(Record):
    code = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, max_length=1000)
    published = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'code']

    def __str__(self):
        return self.name


class PlanVersion(Record):
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='versions')
    number = models.PositiveIntegerField()
    features = models.JSONField(default=list, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    effective_at = models.DateTimeField(default=timezone.now)
    trial_days = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['plan', 'number'], name='billing_plan_version_unique')]

    def clean(self):
        if not isinstance(self.features, list) or any(f not in FEATURES for f in self.features):
            raise ValidationError({'features': 'Funcionalidades desconocidas.'})
        if not isinstance(self.limits, dict) or any(k not in LIMITS or (v is not None and (type(v) is not int or v < 0)) for k, v in self.limits.items()):
            raise ValidationError({'limits': 'Usa límites enteros no negativos o null (sin límite).'})
        if self.trial_days > 365:
            raise ValidationError({'trial_days': 'El período de prueba no puede superar un año.'})

    def save(self, *args, **kwargs):
        if not self._state.adding:
            old = type(self).objects.get(pk=self.pk)
            if any(getattr(old, f) != getattr(self, f) for f in ('plan_id', 'number', 'features', 'limits', 'effective_at', 'trial_days')):
                raise ValidationError('Crea una nueva versión para cambiar derechos o límites.')
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.plan} v{self.number}'


class Price(Record):
    version = models.ForeignKey(PlanVersion, on_delete=models.PROTECT, related_name='prices')
    amount = models.PositiveBigIntegerField()  # CLP integer pesos; no floating point money.
    currency = models.CharField(max_length=3, default='CLP', choices=[('CLP', 'CLP')])
    interval = models.CharField(max_length=10, choices=[('MONTH', 'Mensual'), ('YEAR', 'Anual')])
    published = models.BooleanField(default=False)
    effective_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name='billing_price_positive')]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            old = type(self).objects.get(pk=self.pk)
            if any(getattr(old, f) != getattr(self, f) for f in ('version_id', 'amount', 'currency', 'interval', 'effective_at')):
                raise ValidationError('El precio es inmutable. Crea otro y retira su publicación.')
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.version}: {self.amount} {self.currency} / {self.interval}'


class Subscription(Record):
    class State(models.TextChoices):
        PENDING = 'PENDING', 'Pendiente'
        TRIALING = 'TRIALING', 'En prueba'
        ACTIVE = 'ACTIVE', 'Activa'
        PAST_DUE = 'PAST_DUE', 'Pago pendiente'
        CANCELLED = 'CANCELLED', 'Cancelada'
        EXPIRED = 'EXPIRED', 'Vencida'
        SUSPENDED = 'SUSPENDED', 'Suspendida'

    business = models.OneToOneField('businesses.Business', on_delete=models.PROTECT, related_name='subscription')
    # Legacy is explicit continuity of existing development access, never a paid activation.
    legacy_access = models.BooleanField(default=True)
    version = models.ForeignKey(PlanVersion, null=True, blank=True, on_delete=models.PROTECT)
    price = models.ForeignKey(Price, null=True, blank=True, on_delete=models.PROTECT)
    state = models.CharField(max_length=12, choices=State.choices, default=State.PENDING)
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    trial_used = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(state__in=['PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'SUSPENDED']), name='billing_subscription_state'),
            models.CheckConstraint(condition=(models.Q(period_start__isnull=True, period_end__isnull=True) | models.Q(period_start__isnull=False, period_end__isnull=False, period_end__gt=models.F('period_start'))), name='billing_subscription_period'),
        ]
        permissions = [('operate_billing', 'Operar facturación SaaS')]

    def clean(self):
        if self.price_id and self.price.version_id != self.version_id:
            raise ValidationError('El precio y la versión del plan no coinciden.')
        if self.state in ('ACTIVE', 'TRIALING', 'PAST_DUE'):
            if self.legacy_access or not self.version_id or not self.period_start or not self.period_end:
                raise ValidationError('Una suscripción vigente requiere plan y período explícitos.')
            if self.state != 'TRIALING' and not self.price_id:
                raise ValidationError('Una suscripción pagada requiere un precio versionado.')

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class PaymentOrder(Record):
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name='orders')
    price = models.ForeignKey(Price, on_delete=models.PROTECT)
    request_id = models.UUIDField()
    # Server snapshot: client can choose a price ID, never an amount or entitlement.
    amount = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3)
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    expected_revision = models.PositiveIntegerField()
    state = models.CharField(max_length=10, default='PENDING', choices=[('PENDING', 'Pendiente'), ('PAID', 'Pagado'), ('FAILED', 'Fallido'), ('REFUNDED', 'Reembolsado')])
    provider = models.CharField(max_length=20)
    provider_reference = models.CharField(max_length=150, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(fields=['subscription', 'request_id'], name='billing_order_request_unique'),
            models.UniqueConstraint(fields=['provider', 'provider_reference'], condition=~models.Q(provider_reference__in=['', 'CHECKOUT_REQUESTED']), name='billing_provider_reference_unique'),
        ]


class ProviderEvent(Record):
    provider = models.CharField(max_length=20)
    event_key = models.CharField(max_length=180)
    order = models.ForeignKey(PaymentOrder, on_delete=models.PROTECT, related_name='events')
    status = models.CharField(max_length=16)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['provider', 'event_key'], name='billing_provider_event_unique')]


class SubscriptionChange(Record):
    subscription = models.ForeignKey(Subscription, on_delete=models.PROTECT, related_name='changes')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    request_id = models.UUIDField()
    action = models.CharField(max_length=16)
    price = models.ForeignKey(Price, null=True, blank=True, on_delete=models.PROTECT)
    effective_at = models.DateTimeField()
    applied = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['subscription', 'request_id'], name='billing_change_request_unique')]


class BillingAudit(Record):
    subscription = models.ForeignKey(Subscription, null=True, blank=True, on_delete=models.PROTECT, related_name='audit')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=50)
    resource_id = models.UUIDField()
    # IDs, states, and revisions only; no callback tokens, cards, bodies, or credentials.
    metadata = models.JSONField(default=dict)


class BusinessRegistration(Record):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    request_id = models.UUIDField()
    digest = models.CharField(max_length=64)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'request_id'], name='billing_business_registration_unique')]
