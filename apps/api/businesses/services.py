from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Business, Employee, Membership
from .permissions import MANAGER_ROLES, active_membership


def create_business(user, data):
    try:
        with transaction.atomic():
            business = Business.objects.create(**data)
            Membership.objects.create(user=user, business=business, role=Membership.Role.OWNER)
            return business
    except IntegrityError as exc:
        raise ValidationError('No se pudo crear el negocio con estos datos.') from exc


def write_employee(user, business_id, data, employee_id=None):
    try:
        with transaction.atomic():
            business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
            # Recheck authorization under the same lock used by membership changes.
            membership = active_membership(user, business_id)
            if membership.role not in MANAGER_ROLES:
                raise PermissionDenied()
            employee = (
                get_object_or_404(Employee, pk=employee_id, business=business)
                if employee_id else Employee(business=business)
            )
            for field, value in data.items():
                setattr(employee, 'user_id' if field == 'user' else field, value)
            employee.save()
            return employee
    except IntegrityError as exc:
        raise ValidationError('No se pudo guardar la ficha con estos datos.') from exc
