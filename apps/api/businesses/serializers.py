from rest_framework import serializers

from config.api import StrictInputMixin
from .models import Business, Employee, Membership


class BusinessSerializer(StrictInputMixin, serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    def get_role(self, business):
        return business.memberships.filter(
            user=self.context['request'].user, is_active=True,
        ).values_list('role', flat=True).first()

    class Meta:
        model = Business
        fields = ('id', 'name', 'rut', 'is_active', 'created_at', 'updated_at', 'role')
        read_only_fields = ('id', 'is_active', 'created_at', 'updated_at')
        # Model.full_clean normalizes before enforcing conditional RUT uniqueness.
        validators = []


class EmployeeSerializer(StrictInputMixin, serializers.ModelSerializer):
    # A UUID, not a global User queryset: no account-existence oracle across tenants.
    user = serializers.UUIDField(source='user_id', required=False, allow_null=True)

    class Meta:
        model = Employee
        fields = (
            'id', 'business', 'user', 'first_name', 'last_name', 'email',
            'hire_date', 'is_active', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'business', 'created_at', 'updated_at')
        validators = []

    def validate_user(self, value):
        if value is not None and not Membership.objects.filter(
            business=self.context['business'], user_id=value, is_active=True,
        ).exists():
            raise serializers.ValidationError('El usuario no tiene una membresía activa en este negocio.')
        return value
