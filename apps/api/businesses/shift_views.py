from datetime import datetime, time

from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics, mixins
from rest_framework.permissions import IsAuthenticated

from .models import Membership, Shift
from .permissions import BusinessScopedPermission
from .shift_serializers import SANTIAGO, ShiftRangeSerializer, ShiftSerializer
from .shift_services import write_shift


@method_decorator(never_cache, name='dispatch')
class ShiftBaseView(generics.GenericAPIView):
    serializer_class = ShiftSerializer
    permission_classes = [IsAuthenticated, BusinessScopedPermission]

    def get_queryset(self):
        queryset = Shift.objects.filter(business=self.business).select_related('employee').order_by('starts_at', 'id')
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
