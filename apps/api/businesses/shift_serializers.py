from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from config.api import StrictInputMixin
from .models import Employee, Shift

SANTIAGO = ZoneInfo('America/Santiago')


class AwareDateTimeField(serializers.DateTimeField):
    def to_internal_value(self, value):
        try:
            parsed = parse_datetime(value) if isinstance(value, str) else value
        except (ValueError, TypeError):
            parsed = None
        if not isinstance(parsed, datetime) or timezone.is_naive(parsed):
            raise serializers.ValidationError('Indica fecha y hora ISO 8601 con zona horaria (Z o ±HH:MM).')
        return super().to_internal_value(value)


class ShiftSerializer(StrictInputMixin, serializers.ModelSerializer):
    employee = serializers.UUIDField(source='employee_id')
    employee_name = serializers.SerializerMethodField()
    starts_at = AwareDateTimeField()
    ends_at = AwareDateTimeField()

    class Meta:
        model = Shift
        fields = ('id', 'business', 'employee', 'employee_name', 'starts_at', 'ends_at', 'status', 'created_at', 'updated_at')
        read_only_fields = ('id', 'business', 'created_at', 'updated_at')
        validators = []

    def get_employee_name(self, shift):
        return str(shift.employee)

    def validate_employee(self, value):
        if not Employee.objects.filter(pk=value, business=self.context['business']).exists():
            raise serializers.ValidationError('El trabajador no está disponible en este negocio.')
        return value

    def validate(self, attrs):
        if not self.instance and attrs.get('status', Shift.Status.SCHEDULED) != Shift.Status.SCHEDULED:
            raise serializers.ValidationError({'status': 'Los turnos nuevos deben estar programados.'})
        return attrs


class ShiftRangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Shift.Status.choices, required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    employee = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if ('date_from' in attrs) != ('date_to' in attrs):
            raise serializers.ValidationError('Indica date_from y date_to juntos.')
        if 'date_from' not in attrs:
            today = timezone.localdate(timezone=SANTIAGO)
            attrs['date_from'] = today - timedelta(days=today.weekday())
            attrs['date_to'] = attrs['date_from'] + timedelta(days=7)
        span = (attrs['date_to'] - attrs['date_from']).days
        if not 1 <= span <= 31:
            raise serializers.ValidationError('El intervalo debe tener entre 1 y 31 días; date_to es exclusivo.')
        return attrs
