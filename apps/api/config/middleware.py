import logging

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse

logger = logging.getLogger('zenvik.security')


class APIBoundaryMiddleware:
    """Bound JSON input before DRF streaming parsers and avoid logging payloads."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith('/api/v1/'):
            return self.get_response(request)
        try:
            # Accessing body makes Django enforce DATA_UPLOAD_MAX_MEMORY_SIZE.
            # The public proxy also bounds chunked input before forwarding it.
            if len(request.body) > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
                raise RequestDataTooBig()
        except RequestDataTooBig:
            logger.warning('api_input_rejected reason=body_limit')
            response = JsonResponse({'detail': 'Solicitud demasiado grande.'}, status=413)
        else:
            response = self.get_response(request)
        response['Cache-Control'] = 'no-store'
        if response.status_code >= 400:
            # No URL/query string, usernames, IDs, bodies, cookies or credentials.
            logger.warning('api_rejected status=%s method=%s', response.status_code, request.method)
        return response
