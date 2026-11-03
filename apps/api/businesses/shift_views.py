from datetime import datetime, time

from django.utils.decorators import method_decorator
from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import never_cache
from rest_framework import generics, mixins, serializers
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated

from .models import Business, LeaveRequest, Membership, Shift
from .permissions import BusinessScopedPermission, MANAGER_ROLES, active_membership
from config.api import StrictInputMixin
from .shift_serializers import SANTIAGO, ShiftRangeSerializer, ShiftSerializer
from .shift_services import write_shift, write_shift_batch


@method_decorator(never_cache, name='dispatch')
class ShiftBaseView(generics.GenericAPIView):
    serializer_class = ShiftSerializer
    permission_classes = [IsAuthenticated, BusinessScopedPermission]

    def get_queryset(self):
        queryset = Shift.objects.filter(business=self.business).select_related('employee', 'business').prefetch_related(Prefetch('employee__leave_requests', queryset=LeaveRequest.objects.filter(business=self.business, status='APPROVED'), to_attr='planning_leaves')).order_by('starts_at', 'id')
        if self.membership.role == Membership.Role.EMPLOYEE:
            queryset = queryset.filter(employee__user=self.request.user)
        return queryset

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'business': self.business}


class ShiftListCreateView(mixins.ListModelMixin, mixins.CreateModelMixin, ShiftBaseView):
    def get_queryset(self):
        queryset = super().get_queryset()
        filters = ShiftRangeSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        data = filters.validated_data
        # Whole local calendar days, including DST days of 23 or 25 hours.
        start = datetime.combine(data['date_from'], time.min, tzinfo=SANTIAGO)
        end = datetime.combine(data['date_to'], time.min, tzinfo=SANTIAGO)
        queryset = queryset.filter(starts_at__lt=end, ends_at__gt=start)
        if 'employee' in data:
            queryset = queryset.filter(employee_id=data['employee'])
        if 'status' in data:
            queryset = queryset.filter(status=data['status'])
        return queryset

    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        return self.create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.instance = write_shift(self.request.user, self.business.pk, serializer.validated_data)


class ShiftDetailView(mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, ShiftBaseView):
    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        return self.destroy(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.instance = write_shift(self.request.user, self.business.pk, serializer.validated_data, shift_id=serializer.instance.pk)

    def perform_destroy(self, instance):
        # Soft cancellation: preserve planning history and permit idempotent retries.
        write_shift(self.request.user, self.business.pk, {}, shift_id=instance.pk, cancel=True)


class BatchSerializer(StrictInputMixin, serializers.Serializer):
    request_id = serializers.UUIDField()
    shifts = ShiftSerializer(many=True, min_length=1, max_length=100)


class ShiftBatchView(ShiftBaseView):
    def post(self, request, *args, **kwargs):
        serializer = BatchSerializer(data=request.data, context={'business': self.business})
        serializer.is_valid(raise_exception=True)
        rows = serializer.validated_data['shifts']
        if any('request_id' in row or 'expected_updated_at' in row for row in rows):
            raise ValidationError('Utiliza una sola clave de reintento para el lote.')
        shifts = write_shift_batch(request.user, self.business.pk, rows, serializer.validated_data['request_id'])
        return Response(ShiftSerializer(shifts, many=True).data, status=201)


class PlanningSettingsSerializer(StrictInputMixin, serializers.ModelSerializer):
    planning_max_minutes = serializers.IntegerField(min_value=1, max_value=44640, allow_null=True, required=False)

    class Meta:
        model = Business
        fields = ('planning_max_minutes', 'planning_block_leave', 'planning_timezone')
        read_only_fields = ('planning_timezone',)


class PlanningSettingsView(ShiftBaseView):
    def get(self, request, *args, **kwargs):
        return Response(PlanningSettingsSerializer(self.business).data)

    def patch(self, request, *args, **kwargs):
        with transaction.atomic():
            business = get_object_or_404(Business.objects.select_for_update(), pk=self.business.pk)
            if active_membership(request.user, business.pk).role not in MANAGER_ROLES:
                raise PermissionDenied()
            serializer = PlanningSettingsSerializer(business, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)


class ShiftHistoryView(ShiftBaseView):
    def get(self, request, *args, **kwargs):
        if self.membership.role not in MANAGER_ROLES:
            raise PermissionDenied()
        shift = self.get_object()
        revisions = shift.revisions.select_related('actor').order_by('-created_at', '-id')
        page = self.paginate_queryset(revisions)
        data = [{'id': row.pk, 'action': row.action, 'actor_name': row.actor.get_username() if row.actor else None, 'snapshot': row.snapshot, 'created_at': row.created_at} for row in page]
        return self.get_paginated_response(data)
