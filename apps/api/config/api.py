from collections.abc import Mapping
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response


class StrictInputMixin:
    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            allowed = {name for name, field in self.fields.items() if not field.read_only}
            forbidden = set(data) - allowed
            if forbidden:
                raise serializers.ValidationError({name: 'Campo no permitido.' for name in forbidden})
        return super().to_internal_value(data)


def exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = serializers.ValidationError(
            exc.message_dict if hasattr(exc, 'message_dict') else exc.messages
        )
    response = drf_exception_handler(exc, context)
    if response is None:
        # Exception text may contain SQL, connection details or personal data.
        logging.getLogger('zenvik.security').error('api_internal_error type=%s', type(exc).__name__)
        return Response({'detail': 'No pudimos completar la operación.'}, status=500)
    return response
