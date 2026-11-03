from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from config.api import StrictInputMixin
from .models import Business, Employee, EmployeeRevision, Membership, Shift
from .permissions import active_membership, MANAGER_ROLES
from .views import EmployeeDetailView, EmployeeListCreateView
from .services import write_employee


class EmployeeHistoryView(EmployeeDetailView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request, *args, **kwargs):
        if self.membership.role not in MANAGER_ROLES:
            raise PermissionDenied()
        employee = self.get_object()
        rows = self.paginate_queryset(employee.revisions.select_related('actor').order_by('-created_at', '-id'))
        return self.get_paginated_response([{'id': row.pk, 'action': row.action, 'actor_name': row.actor.get_username() if row.actor else None, 'snapshot': row.snapshot, 'created_at': row.created_at} for row in rows])


class EmployeeImpactView(EmployeeDetailView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request, *args, **kwargs):
        employee = self.get_object()
        shifts = Shift.objects.filter(business=self.business, employee=employee, status='SCHEDULED', ends_at__gt=timezone.now()).order_by('starts_at', 'id')
        return Response({'scheduled_count': shifts.count(), 'shifts': list(shifts.values('id', 'starts_at', 'ends_at')[:10]), 'timezone': self.business.planning_timezone})


class JobTitlesView(EmployeeListCreateView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request, *args, **kwargs):
        rows = self.get_queryset().exclude(job_title='').order_by('job_title').values_list('job_title', flat=True).distinct()
        page = self.paginate_queryset(rows)
        return self.get_paginated_response([{'id': name, 'name': name} for name in page])


class BusinessAccountsView(EmployeeListCreateView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request, *args, **kwargs):
        if self.membership.role != 'OWNER':
            raise PermissionDenied()
        rows = Membership.objects.filter(business=self.business, is_active=True, user__is_active=True).exclude(role='OWNER').select_related('user').order_by('user__username', 'id')
        page = self.paginate_queryset(rows)
        linked = set(Employee.objects.filter(business=self.business, user_id__in=[row.user_id for row in page]).values_list('user_id', flat=True))
        return self.get_paginated_response([{'id': str(row.user_id), 'name': row.user.get_username(), 'role': row.role, 'access_enabled': row.access_enabled, 'linked': row.user_id in linked} for row in page])


class EmployeeAccessSerializer(StrictInputMixin, serializers.Serializer):
    user = serializers.UUIDField(required=False, allow_null=True)
    role = serializers.ChoiceField(choices=['ADMIN', 'EMPLOYEE'], required=False)
    access_enabled = serializers.BooleanField(required=False)
    expected_updated_at = serializers.DateTimeField(required=True)


class EmployeeAccessView(EmployeeDetailView):
    http_method_names = ['patch', 'options']

    def patch(self, request, *args, **kwargs):
        with transaction.atomic():
            business = get_object_or_404(Business.objects.select_for_update(), pk=self.business.pk)
            actor = active_membership(request.user, business.pk)
            if actor.role != 'OWNER':
                raise PermissionDenied('Solo el propietario puede gestionar el acceso.')
            employee = get_object_or_404(Employee, business=business, pk=kwargs['pk'])
            serializer = EmployeeAccessSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            if employee.updated_at != data['expected_updated_at']:
                raise ValidationError('La ficha cambió. Actualiza la página antes de gestionar el acceso.')
            target_id = data.get('user', employee.user_id)
            if request.user.pk in (employee.user_id, target_id):
                raise PermissionDenied('No puedes modificar tu propio acceso por este flujo.')
            if Membership.objects.filter(business=business, role='OWNER', user_id__in=[value for value in (employee.user_id, target_id) if value]).exists():
                raise PermissionDenied('Este flujo no permite modificar propietarios.')
            target = Membership.objects.filter(business=business, user_id=target_id, is_active=True, user__is_active=True).first() if target_id else None
            if target_id and not target:
                raise ValidationError('La cuenta no está disponible para este negocio.')
            if not target and ('role' in data or 'access_enabled' in data):
                raise ValidationError('Vincula una cuenta del negocio antes de modificar su acceso.')
            before = {'user_id': str(employee.user_id) if employee.user_id else None}
            old = Membership.objects.filter(business=business, user_id=employee.user_id).first() if employee.user_id else None
            before.update(account_name=employee.user.get_username() if employee.user_id else None, role=old.role if old else None, access_enabled=old.access_enabled if old else False)
            employee = write_employee(request.user, business.pk, {'user_id': target_id}, employee.pk)
            if target:
                target.role = data.get('role', target.role)
                target.access_enabled = data.get('access_enabled', target.access_enabled)
                target.save()
            after = {'account_name': target.user.get_username() if target else None, 'user_id': str(target_id) if target_id else None, 'role': target.role if target else None, 'access_enabled': target.access_enabled if target else False}
            if before != after:
                revision = EmployeeRevision.objects.create(employee=employee, actor=request.user, action='ACCESS', snapshot={'before': before, 'after': after})
                from attendance.incidents import audit
                audit(business, request.user, 'ADMIN_ACCESS_CHANGED', 'employee_access', employee.pk, {'revision': revision.pk, 'before': {key: before[key] for key in ['user_id', 'role', 'access_enabled']}, 'after': {key: after[key] for key in ['user_id', 'role', 'access_enabled']}})
            return Response(self.get_serializer(employee).data)
