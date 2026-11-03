import hashlib
import json

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Business, PlanningOperation, Shift
from .permissions import MANAGER_ROLES, active_membership


def write_shift(user, business_id, data, shift_id=None, cancel=False):
    try:
        with transaction.atomic():
            business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
            membership = active_membership(user, business_id)
            if membership.role not in MANAGER_ROLES:
                raise PermissionDenied()
            data = dict(data)
            request_id = data.pop('request_id', None)
            expected = data.pop('expected_updated_at', None)
            digest = hashlib.sha256(json.dumps(data, default=str, sort_keys=True).encode()).hexdigest()
            if request_id and not shift_id:
                operation = PlanningOperation.objects.filter(business=business, request_id=request_id).first()
                if operation:
                    if operation.digest != digest:
                        raise ValidationError('La clave de reintento ya corresponde a otra operación.')
                    return Shift.objects.get(pk=operation.shift_ids[0], business=business)
            shift = (
                get_object_or_404(Shift.objects.select_related('employee'), pk=shift_id, business=business)
                if shift_id else Shift(business=business)
            )
            if expected and shift_id and shift.updated_at != expected:
                raise ValidationError('Otro administrador cambió este turno. Actualiza el calendario antes de editar.')
            shift._actor = user
            for field, value in data.items():
                setattr(shift, field, value)
            if cancel:
                shift.status = Shift.Status.CANCELLED
            shift.save()
            if request_id and not shift_id:
                PlanningOperation.objects.create(business=business, request_id=request_id, digest=digest, shift_ids=[str(shift.pk)])
            return shift
    except IntegrityError as exc:
        raise ValidationError('No se pudo guardar el turno. Revisa el trabajador y el horario.') from exc


def write_shift_batch(user, business_id, rows, request_id):
    """One business lock and transaction; any invalid row rolls back the entire batch."""
    with transaction.atomic():
        business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
        if active_membership(user, business_id).role not in MANAGER_ROLES:
            raise PermissionDenied()
        digest = hashlib.sha256(json.dumps(rows, default=str, sort_keys=True).encode()).hexdigest()
        operation = PlanningOperation.objects.filter(business=business, request_id=request_id).first()
        if operation:
            if operation.digest != digest:
                raise ValidationError('La clave de reintento ya corresponde a otra operación.')
            return list(Shift.objects.filter(business=business, pk__in=operation.shift_ids).select_related('employee'))
        shifts = [write_shift(user, business_id, row) for row in rows]
        PlanningOperation.objects.create(business=business, request_id=request_id, digest=digest, shift_ids=[str(shift.pk) for shift in shifts])
        return shifts
