"""Public health responses contain no database identity, versions or exception text."""

from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.http import require_safe


@require_safe
def live(request):
    response = JsonResponse({"status": "ok", "service": "api"})
    response["Cache-Control"] = "no-store"
    return response


@require_safe
def ready(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        available = True
    except DatabaseError:
        available = False
    response = JsonResponse(
        {"status": "ok" if available else "unavailable"},
        status=200 if available else 503,
    )
    response["Cache-Control"] = "no-store"
    return response
