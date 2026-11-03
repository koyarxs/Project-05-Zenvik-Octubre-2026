import math
from rest_framework import serializers
from config.api import StrictInputMixin
from .models import AttendanceEvent, AttendanceSession


class FiniteFloat(serializers.FloatField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not math.isfinite(value):
            raise serializers.ValidationError('Indica un número finito válido.')
        return value


class LocationInput(StrictInputMixin, serializers.Serializer):
    latitude = FiniteFloat(min_value=-90, max_value=90)
    longitude = FiniteFloat(min_value=-180, max_value=180)
    accuracy_meters = FiniteFloat(min_value=0, max_value=100000)


class EventInput(StrictInputMixin, serializers.Serializer):
    event_type = serializers.ChoiceField(choices=['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT'])
    request_id = serializers.UUIDField()
    session_id = serializers.UUIDField(allow_null=True)
    expected_version = serializers.IntegerField(min_value=0)
    location = LocationInput(allow_null=True)
    location_status = serializers.ChoiceField(choices=['AVAILABLE', 'DENIED', 'UNAVAILABLE', 'TIMEOUT', 'UNSUPPORTED', 'INSECURE'])
    exception_reason = serializers.CharField(max_length=500, allow_blank=True, default='')

    def validate(self, data):
        if (data['location'] is not None) != (data['location_status'] == 'AVAILABLE'):
            raise serializers.ValidationError('El estado de ubicación no coincide con los datos disponibles.')
        return data


class SiteInput(StrictInputMixin, serializers.Serializer):
    id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=100)
    latitude = FiniteFloat(min_value=-90, max_value=90)
    longitude = FiniteFloat(min_value=-180, max_value=180)
    radius_meters = serializers.IntegerField(min_value=10, max_value=100000)
    is_active = serializers.BooleanField(default=True)


class PolicyInput(StrictInputMixin, serializers.Serializer):
    expected_version = serializers.IntegerField(min_value=0)
    location_required = serializers.BooleanField()
    max_accuracy_meters = serializers.IntegerField(min_value=1, max_value=10000)
    retention_days = serializers.IntegerField(min_value=1, max_value=36500, allow_null=True)
    sites = SiteInput(many=True, max_length=20)


class HistoryInput(StrictInputMixin, serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    page = serializers.IntegerField(min_value=1, required=False)

    def validate(self, data):
        if data.get('date_from') and data.get('date_to') and data['date_from'] > data['date_to']:
            raise serializers.ValidationError('La fecha final debe ser igual o posterior a la inicial.')
        return data


class EventRead(serializers.ModelSerializer):
    class Meta:
        model = AttendanceEvent
        fields = ['id', 'session', 'employee_name', 'business_name', 'event_type', 'recorded_at', 'sequence', 'location_status', 'geo_result', 'accuracy_meters', 'exception_reason', 'integrity_hash', 'previous_hash']


class SessionRead(serializers.ModelSerializer):
    events = EventRead(many=True, read_only=True)

    class Meta:
        model = AttendanceSession
        fields = ['id', 'work_date', 'timezone_name', 'state', 'version', 'shift', 'shift_snapshot', 'created_at', 'updated_at', 'events']
