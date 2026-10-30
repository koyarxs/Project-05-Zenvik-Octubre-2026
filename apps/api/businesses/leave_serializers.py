from rest_framework import serializers

from config.api import StrictInputMixin
from .leave_services import affected_shifts
from .models import LeaveRequest
from .permissions import MANAGER_ROLES


class LeaveCreateSerializer(StrictInputMixin, serializers.ModelSerializer):
    class Meta:
        model = LeaveRequest
        fields = ('request_type', 'start_date', 'end_date', 'reason')


class LeaveDecisionSerializer(StrictInputMixin, serializers.Serializer):
    review_note = serializers.CharField(required=False, allow_blank=True, max_length=1000, default='')


class LeaveCancelSerializer(StrictInputMixin, serializers.Serializer):
    pass


class LeaveReadSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source='reviewed_by.username', default=None)
    can_cancel = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = ('id', 'business', 'employee', 'employee_name', 'request_type', 'start_date', 'end_date', 'reason', 'status', 'reviewed_by', 'reviewed_by_name', 'reviewed_at', 'review_note', 'created_at', 'updated_at', 'can_cancel', 'can_review')

    def get_employee_name(self, obj):
        return str(obj.employee)

    def get_can_cancel(self, obj):
        return obj.status == 'PENDING' and obj.requested_by_id == self.context['request'].user.pk

    def get_can_review(self, obj):
        return obj.status == 'PENDING' and self.context['membership'].role in MANAGER_ROLES and self.context['request'].user.pk not in (obj.requested_by_id, obj.employee.user_id)


class LeaveDetailSerializer(LeaveReadSerializer):
    affected_shifts = serializers.SerializerMethodField()

    class Meta(LeaveReadSerializer.Meta):
        fields = (*LeaveReadSerializer.Meta.fields, 'affected_shifts')

    def get_affected_shifts(self, obj):
        if self.context['membership'].role not in MANAGER_ROLES:
            return {'visible': False, 'count': 0, 'results': []}
        shifts = affected_shifts(obj)
        return {'visible': True, 'count': shifts.count(), 'results': list(shifts.values('id', 'starts_at', 'ends_at')[:20])}


class LeaveFilterSerializer(serializers.Serializer):
    employee = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(choices=LeaveRequest.Status.choices, required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        if attrs.get('date_from') and attrs.get('date_to') and attrs['date_to'] < attrs['date_from']:
            raise serializers.ValidationError('La fecha hasta debe ser igual o posterior a desde.')
        return attrs
