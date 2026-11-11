from rest_framework import serializers

from config.api import StrictInputMixin
from .models import Business, Employee, Membership
from .permissions import MANAGER_ROLES


class BusinessSerializer(StrictInputMixin, serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    request_id = serializers.UUIDField(write_only=True, required=False)

    def get_role(self, business):
        return business.memberships.filter(
            user=self.context['request'].user, is_active=True,
        ).values_list('role', flat=True).first()

    class Meta:
        model = Business
        fields = ('id', 'name', 'rut', 'is_active', 'created_at', 'updated_at', 'role', 'request_id')
        read_only_fields = ('id', 'is_active', 'created_at', 'updated_at')
        # Model.full_clean normalizes before enforcing conditional RUT uniqueness.
        validators = []


class RegistrationBusinessSerializer(StrictInputMixin, serializers.ModelSerializer):
    team_size = serializers.IntegerField(min_value=1, max_value=100000, required=False, allow_null=True)

    class Meta:
        model = Business
        fields = (
            'name', 'rut', 'legal_name', 'industry', 'team_size', 'region', 'commune',
            'locality', 'address', 'contact_email', 'contact_phone', 'primary_location',
        )
        validators = []


class EmployeeSerializer(StrictInputMixin, serializers.ModelSerializer):
    # A UUID, not a global User queryset: no account-existence oracle across tenants.
    user = serializers.UUIDField(source='user_id', required=False, allow_null=True)

    expected_updated_at = serializers.DateTimeField(write_only=True, required=False)
    access_role = serializers.SerializerMethodField()
    access_enabled = serializers.SerializerMethodField()
    account_name = serializers.CharField(source='user.username', read_only=True, default=None)

    def get_fields(self):
        fields = super().get_fields()
        membership = self.context.get('membership')
        if membership and membership.role not in MANAGER_ROLES:
            fields.pop('admin_notes', None)
        return fields

    def account_membership(self, employee):
        memberships = self.context.get('employee_memberships')
        if memberships is not None:
            return memberships.get(employee.user_id)
        return Membership.objects.filter(business=employee.business, user_id=employee.user_id).first() if employee.user_id else None

    def get_access_role(self, employee):
        membership = self.account_membership(employee)
        return membership.role if membership else None

    def get_access_enabled(self, employee):
        membership = self.account_membership(employee)
        return bool(membership and membership.is_active and membership.access_enabled and employee.user.is_active)

    class Meta:
        model = Employee
        fields = (
            'id', 'business', 'user', 'first_name', 'last_name', 'email',
            'hire_date', 'is_active', 'created_at', 'updated_at', 'phone', 'job_title', 'employee_code', 'work_schedule', 'admin_notes', 'access_role', 'access_enabled', 'account_name', 'expected_updated_at',
        )
        read_only_fields = ('id', 'business', 'created_at', 'updated_at')
        validators = []

    def validate_user(self, value):
        if value is not None and not Membership.objects.filter(
            business=self.context['business'], user_id=value, is_active=True,
        ).exists():
            raise serializers.ValidationError('El usuario no tiene una membresía activa en este negocio.')
        return value
