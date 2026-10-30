from collections.abc import Mapping

from django.contrib.auth import authenticate, login, logout
from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_protect
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, RegisterSerializer, UserSerializer
from .services import reserve_auth_attempt
from .turnstile import verify_turnstile


def csrf_failure(request, reason=''):
    return JsonResponse({'detail': 'Verificación CSRF fallida.'}, status=403)


@method_decorator(never_cache, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class AuthView(APIView):
    pass


class CsrfView(AuthView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'csrfToken': get_token(request), 'turnstile': {
            'enabled': settings.TURNSTILE_ENABLED,
            'siteKey': settings.TURNSTILE_SITE_KEY if settings.TURNSTILE_ENABLED else None,
        }})


class RegisterView(AuthView):
    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.PUBLIC_REGISTRATION_ENABLED:
            raise PermissionDenied('El registro público no está habilitado.')
        reserve_auth_attempt([(f'register:ip:{request.META.get("REMOTE_ADDR", "unknown")}', 10, 3600)])
        # Verify before uniqueness/password validation to avoid exposing account
        # registration information to requests that have not passed the challenge.
        verify_turnstile(request.data.get('turnstile_token') if isinstance(request.data, Mapping) else None, 'register')
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                user = serializer.save()
        except IntegrityError as exc:
            raise ValidationError('No se pudo registrar la cuenta con estos datos.') from exc
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(AuthView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data['username']
        reserve_auth_attempt([
            (f'login:ip:{request.META.get("REMOTE_ADDR", "unknown")}', 30, 900),
            (f'login:user:{username.casefold()}', 5, 900),
        ])
        data = serializer.validated_data.copy()
        verify_turnstile(data.pop('turnstile_token', None), 'login')
        user = authenticate(request=request, **data)
        if user is None:
            raise PermissionDenied('Credenciales inválidas.')
        login(request, user)
        return Response({'user': UserSerializer(user).data, 'csrfToken': get_token(request)})


class LogoutView(AuthView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(AuthView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)
