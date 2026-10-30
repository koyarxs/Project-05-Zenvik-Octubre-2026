from datetime import datetime, time, timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Business, Employee, LeaveRequest, Shift
from .permissions import MANAGER_ROLES, active_membership
from .shift_serializers import SANTIAGO


def affected_shifts(leave):
    start = datetime.combine(leave.start_date, time.min, tzinfo=SANTIAGO)
    end = datetime.combine(leave.end_date + timedelta(days=1), time.min, tzinfo=SANTIAGO)
    return Shift.objects.filter(business_id=leave.business_id, employee_id=leave.employee_id, status=Shift.Status.SCHEDULED, starts_at__lt=end, ends_at__gt=start).order_by('starts_at', 'id')


@transaction.atomic
def create_leave(user, business_id, data):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    active_membership(user, business_id)
    employee = Employee.objects.filter(business=business, user=user, is_active=True).first()
    if not employee:
        raise ValidationError('Necesitas una ficha activa vinculada a tu cuenta en este negocio.')
    return LeaveRequest.objects.create(business=business, employee=employee, requested_by=user, **data)


@transaction.atomic
def decide_leave(user, business_id, leave_id, action, review_note=''):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    membership = active_membership(user, business_id)
    queryset = LeaveRequest.objects.select_for_update().filter(business=business)
    if membership.role not in MANAGER_ROLES:
        queryset = queryset.filter(requested_by=user)
    leave = get_object_or_404(queryset, pk=leave_id)
    if action == 'cancel':
        if leave.requested_by_id != user.pk:
            raise PermissionDenied('Solo quien solicitó el permiso puede cancelarlo.')
    elif membership.role not in MANAGER_ROLES or user.pk in (leave.requested_by_id, leave.employee.user_id):
        raise PermissionDenied('La decisión requiere otro propietario o administrador del negocio.')
    if leave.status != LeaveRequest.Status.PENDING:
        raise ValidationError('Esta solicitud ya fue resuelta o cancelada. Actualiza el listado.')
    leave.status = {'approve': 'APPROVED', 'reject': 'REJECTED', 'cancel': 'CANCELLED'}[action]
    if action != 'cancel':
        leave.reviewed_by = user
        leave.reviewed_at = timezone.now()
        leave.review_note = review_note
    leave.save()
    return leave
