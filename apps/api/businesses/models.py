import uuid
from datetime import date, datetime, timezone as datetime_timezone

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, router, transaction
from django.db.models.signals import pre_delete
from django.dispatch import receiver
from django.utils import timezone

from .validators import normalize_rut


class Business(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    rut = models.CharField(max_length=12, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'businesses'
        constraints = [
            models.UniqueConstraint(
                fields=['rut'], condition=~models.Q(rut=''), name='unique_business_rut'
            ),
        ]

    def clean_fields(self, exclude=None):
        # Normalize before field length checks and uniqueness validation (also in Admin).
        if not exclude or 'rut' not in exclude:
            try:
                self.rut = normalize_rut(self.rut)
            except ValidationError as exc:
                raise ValidationError({'rut': exc}) from exc
        super().clean_fields(exclude=exclude)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        OWNER = 'OWNER', 'Owner'
        ADMIN = 'ADMIN', 'Admin'
        EMPLOYEE = 'EMPLOYEE', 'Employee'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='memberships'
    )
    business = models.ForeignKey(
        Business, on_delete=models.PROTECT, related_name='memberships'
    )
    role = models.CharField(max_length=8, choices=Role.choices, default=Role.EMPLOYEE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        super().clean()
        database = self._state.db or router.db_for_write(type(self), instance=self)
        previous = type(self).objects.using(database).filter(pk=self.pk).first()
        if previous and (self.user_id != previous.user_id or self.business_id != previous.business_id):
            raise ValidationError('El usuario y el negocio de una membresía existente son inmutables.')
        if previous and (
            not self.is_active or self.user_id != previous.user_id
            or self.business_id != previous.business_id
        ) and Employee.objects.using(database).filter(
            business_id=previous.business_id, user_id=previous.user_id,
        ).exists():
            raise ValidationError('Desvincule la cuenta de la ficha antes de cambiar su membresía.')

    def save(self, *args, **kwargs):
        database = kwargs.get('using') or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=database):
            old_business = type(self).objects.using(database).filter(pk=self.pk).values_list('business_id', flat=True).first()
            business_ids = {value for value in (old_business, self.business_id) if value}
            list(Business.objects.using(database).select_for_update().filter(pk__in=business_ids).order_by('pk'))
            self.clean()
            return super().save(*args, **kwargs)

    class Meta:
        db_table = 'memberships'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'business'], name='unique_user_business_membership'
            ),
            models.CheckConstraint(
                condition=models.Q(role__in=['OWNER', 'ADMIN', 'EMPLOYEE']),
                name='membership_valid_role',
            ),
        ]


class Employee(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(
        Business, on_delete=models.PROTECT, related_name='employees'
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    hire_date = models.DateField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='employee_records',
        blank=True,
        null=True,
    )

    class Meta:
        db_table = 'employees'
        constraints = [
            models.UniqueConstraint(
                fields=['business', 'user'], name='unique_business_employee_user'
            ),
        ]

    def clean(self):
        super().clean()
        database = self._state.db or router.db_for_write(type(self), instance=self)
        previous_business = type(self).objects.using(database).filter(pk=self.pk).values_list('business_id', flat=True).first()
        if previous_business and previous_business != self.business_id:
            raise ValidationError({'business': 'El negocio de una ficha existente es inmutable.'})
        if self.user_id and self.business_id:
            database = self._state.db or router.db_for_write(type(self), instance=self)
            if not Membership.objects.using(database).filter(
                user_id=self.user_id, business_id=self.business_id, is_active=True
            ).exists():
                raise ValidationError({
                    'user': 'The user must have an active membership in this business.'
                })

    def save(self, *args, **kwargs):
        database = kwargs.get('using') or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=database):
            list(Business.objects.using(database).select_for_update().filter(pk=self.business_id))
            self.full_clean()
            return super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.first_name} {self.last_name}'


@receiver(pre_delete, sender=Membership)
def protect_linked_membership(sender, instance, using, **kwargs):
    # Django's deletion collector runs pre_delete inside an atomic transaction.
    list(Business.objects.using(using).select_for_update().filter(pk=instance.business_id))
    if Employee.objects.using(using).filter(
        business_id=instance.business_id, user_id=instance.user_id,
    ).exists():
        raise ValidationError('Desvincule la cuenta de la ficha antes de eliminar su membresía.')


class Shift(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = 'SCHEDULED', 'Programado'
        CANCELLED = 'CANCELLED', 'Cancelado'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.PROTECT, related_name='shifts', db_index=False)
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name='shifts', db_index=False)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SCHEDULED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shifts'
        indexes = [
            models.Index(fields=['business', 'starts_at'], name='shift_business_start_idx'),
            models.Index(fields=['employee', 'starts_at'], name='shift_employee_start_idx'),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(ends_at__gt=models.F('starts_at')), name='shift_positive_duration'),
            models.CheckConstraint(condition=models.Q(status__in=['SCHEDULED', 'CANCELLED']), name='shift_valid_status'),
        ]

    def clean(self):
        super().clean()
        for field in ('starts_at', 'ends_at'):
            value = getattr(self, field)
            if isinstance(value, datetime) and timezone.is_aware(value):
                setattr(self, field, value.astimezone(datetime_timezone.utc))
        database = self._state.db or router.db_for_write(type(self), instance=self)
        previous = type(self).objects.using(database).filter(pk=self.pk).first()
        if previous and previous.business_id != self.business_id:
            raise ValidationError({'business': 'El negocio del turno es inmutable.'})
        if previous and previous.status == self.Status.CANCELLED and any(
            getattr(previous, field) != getattr(self, field)
            for field in ('employee_id', 'starts_at', 'ends_at', 'status')
        ):
            raise ValidationError('Un turno cancelado no se puede modificar. Crea uno nuevo.')
        employee = Employee.objects.using(database).filter(pk=self.employee_id, business_id=self.business_id).first()
        if not employee:
            raise ValidationError({'employee': 'El trabajador no está disponible en este negocio.'})
        if self.status == self.Status.SCHEDULED and not employee.is_active:
            raise ValidationError({'employee': 'No se pueden asignar turnos a un trabajador inactivo.'})
        if not isinstance(self.starts_at, datetime) or not isinstance(self.ends_at, datetime):
            return  # Required fields are reported by full_clean().
        if timezone.is_naive(self.starts_at) or timezone.is_naive(self.ends_at):
            raise ValidationError('Inicio y término deben incluir zona horaria.')
        if self.ends_at <= self.starts_at:
            raise ValidationError({'ends_at': 'El término debe ser posterior al inicio.'})
        if self.status == self.Status.SCHEDULED and type(self).objects.using(database).filter(
            employee_id=self.employee_id, status=self.Status.SCHEDULED,
            starts_at__lt=self.ends_at, ends_at__gt=self.starts_at,
        ).exclude(pk=self.pk).exists():
            raise ValidationError('El trabajador ya tiene un turno que se superpone con este horario.')

    def save(self, *args, **kwargs):
        database = kwargs.get('using') or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=database):
            list(Business.objects.using(database).select_for_update().filter(pk=self.business_id))
            self.full_clean()
            return super().save(*args, **kwargs)


class LeaveRequest(models.Model):
    class RequestType(models.TextChoices):
        PERSONAL = 'PERSONAL', 'Permiso personal'
        ABSENCE = 'ABSENCE', 'Ausencia'
        DAY_OFF = 'DAY_OFF', 'Día libre solicitado'
        OTHER = 'OTHER', 'Otro'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pendiente'
        APPROVED = 'APPROVED', 'Aprobada'
        REJECTED = 'REJECTED', 'Rechazada'
        CANCELLED = 'CANCELLED', 'Cancelada'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey(Business, on_delete=models.PROTECT, related_name='leave_requests', db_index=False)
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name='leave_requests', db_index=False)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='leave_requests')
    request_type = models.CharField(max_length=8, choices=RequestType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True, max_length=1000)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='reviewed_leave_requests', null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'leave_requests'
        indexes = [
            models.Index(fields=['business', 'status', 'start_date'], name='leave_business_status_idx'),
            models.Index(fields=['employee', 'start_date'], name='leave_employee_start_idx'),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(end_date__gte=models.F('start_date')), name='leave_valid_dates'),
            models.CheckConstraint(condition=models.Q(status__in=['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']), name='leave_valid_status'),
            models.CheckConstraint(condition=models.Q(request_type__in=['PERSONAL', 'ABSENCE', 'DAY_OFF', 'OTHER']), name='leave_valid_type'),
            models.CheckConstraint(condition=(models.Q(status__in=['APPROVED', 'REJECTED'], reviewed_by__isnull=False, reviewed_at__isnull=False) | models.Q(status__in=['PENDING', 'CANCELLED'], reviewed_by__isnull=True, reviewed_at__isnull=True, review_note='')), name='leave_review_consistent'),
        ]

    def clean(self):
        super().clean()
        database = self._state.db or router.db_for_write(type(self), instance=self)
        previous = type(self).objects.using(database).filter(pk=self.pk).first()
        employee = Employee.objects.using(database).filter(pk=self.employee_id, business_id=self.business_id).first()
        if not employee:
            raise ValidationError({'employee': 'El trabajador no está disponible en este negocio.'})
        if not previous:
            if not employee.is_active or employee.user_id != self.requested_by_id:
                raise ValidationError('Necesitas una ficha activa vinculada a tu cuenta para solicitar un permiso.')
            if not Membership.objects.using(database).filter(user_id=self.requested_by_id, business_id=self.business_id, is_active=True, business__is_active=True).exists():
                raise ValidationError('Necesitas una membresía activa en este negocio.')
            if self.status != self.Status.PENDING:
                raise ValidationError('Las solicitudes nuevas deben estar pendientes.')
        else:
            immutable = ('business_id', 'employee_id', 'requested_by_id', 'request_type', 'start_date', 'end_date', 'reason')
            if any(getattr(self, field) != getattr(previous, field) for field in immutable):
                raise ValidationError('La solicitud original es inmutable; cancela y crea otra si necesitas corregirla.')
            changed = any(getattr(self, field) != getattr(previous, field) for field in ('status', 'reviewed_by_id', 'reviewed_at', 'review_note'))
            if changed and (previous.status != self.Status.PENDING or self.status == self.Status.PENDING):
                raise ValidationError('Solo se puede decidir o cancelar una solicitud pendiente.')
        if self.status in (self.Status.APPROVED, self.Status.REJECTED):
            if not self.reviewed_by_id or not self.reviewed_at:
                raise ValidationError('La decisión requiere autor y fecha.')
            if not previous or previous.status == self.Status.PENDING:
                if self.reviewed_by_id in (self.requested_by_id, employee.user_id):
                    raise ValidationError('No puedes revisar tu propia solicitud.')
                if not Membership.objects.using(database).filter(user_id=self.reviewed_by_id, business_id=self.business_id, is_active=True, role__in=['OWNER', 'ADMIN'], business__is_active=True).exists():
                    raise ValidationError('La revisión requiere un administrador activo del negocio.')
        elif self.reviewed_by_id or self.reviewed_at or self.review_note:
            raise ValidationError('Una solicitud sin decisión no puede contener datos de revisión.')
        if isinstance(self.start_date, date) and isinstance(self.end_date, date):
            if self.end_date < self.start_date or self.end_date == date.max:
                raise ValidationError({'end_date': 'Indica un término válido, igual o posterior al inicio y anterior al 31-12-9999.'})
            if self.status in (self.Status.PENDING, self.Status.APPROVED) and type(self).objects.using(database).filter(employee_id=self.employee_id, status__in=[self.Status.PENDING, self.Status.APPROVED], start_date__lte=self.end_date, end_date__gte=self.start_date).exclude(pk=self.pk).exists():
                raise ValidationError('Ya existe una solicitud pendiente o aprobada que se superpone con estas fechas.')

    def save(self, *args, **kwargs):
        database = kwargs.get('using') or router.db_for_write(type(self), instance=self)
        with transaction.atomic(using=database):
            list(Business.objects.using(database).select_for_update().filter(pk=self.business_id))
            self.full_clean()
            return super().save(*args, **kwargs)


@receiver(pre_delete, sender=LeaveRequest)
def preserve_leave_history(sender, instance, **kwargs):
    raise ValidationError('Las solicitudes se conservan como historial; no se pueden eliminar.')
