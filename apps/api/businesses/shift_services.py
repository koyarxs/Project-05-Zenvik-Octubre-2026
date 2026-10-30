from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Business, Shift
from .permissions import MANAGER_ROLES, active_membership


def write_shift(user, business_id, data, shift_id=None, cancel=False):
    try:
        with transaction.atomic():
            business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
            membership = active_membership(user, business_id)
            if membership.role not in MANAGER_ROLES:
                raise PermissionDenied()
            shift = (
                get_object_or_404(Shift.objects.select_related('employee'), pk=shift_id, business=business)
                if shift_id else Shift(business=business)
            )
            for field, value in data.items():
                setattr(shift, field, value)
            if cancel:
                shift.status = Shift.Status.CANCELLED
            shift.save()
            return shift
    except IntegrityError as exc:
        raise ValidationError('No se pudo guardar el turno. Revisa el trabajador y el horario.') from exc
