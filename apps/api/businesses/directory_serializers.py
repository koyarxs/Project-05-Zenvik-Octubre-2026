from rest_framework import serializers


class OptionalQueryBoolean(serializers.BooleanField):
    # QueryDict is considered an HTML form by DRF; absent checkboxes otherwise
    # become False and would silently filter the unfiltered directory.
    default_empty_html = serializers.empty


class EmployeeFilterSerializer(serializers.Serializer):
    search = serializers.CharField(required=False, allow_blank=True, max_length=150)
    is_active = OptionalQueryBoolean(required=False)
