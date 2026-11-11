from collections.abc import Mapping
from time import time

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
from businesses.services import create_business

from .registration_email import require_verified_email, send_registration_email
from .serializers import LoginSerializer, RegisterSerializer, RegistrationEmailSerializer, SessionUserSerializer, UserSerializer
from .services import reserve_auth_attempt
from .session_activity import LAST_ACTIVITY, LAST_SEEN, STARTED, session_times, start_app_session
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
        return Response({'csrfToken': get_token(request), 'registrationEmailRequired': settings.REGISTRATION_VERIFY_EMAIL, 'turnstile': {
            'enabled': settings.TURNSTILE_ENABLED,
            'siteKey': settings.TURNSTILE_SITE_KEY if settings.TURNSTILE_ENABLED else None,
        }})


class RegistrationEmailView(AuthView):
    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.PUBLIC_REGISTRATION_ENABLED or not settings.REGISTRATION_VERIFY_EMAIL:
            raise PermissionDenied('La confirmación por correo no está habilitada.')
        reserve_auth_attempt([(f'registration-email:ip:{request.META.get("REMOTE_ADDR", "unknown")}', 10, 3600)])
        serializer = RegistrationEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verify_turnstile(serializer.validated_data.get('turnstile_token'), 'register')
        email = serializer.validated_data['email'].lower()
        reserve_auth_attempt([(f'registration-email:address:{email}', 3, 3600)])
        # Send the same message even for an existing account to avoid exposing
        # membership through the response or mail delivery timing.
        send_registration_email(email)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(AuthView):
    permission_classes = [AllowAny]

    def post(self, request):
        if not settings.PUBLIC_REGISTRATION_ENABLED:
            raise PermissionDenied('El registro público no está habilitado.')
        reserve_auth_attempt([(f'register:ip:{request.META.get("REMOTE_ADDR", "unknown")}', 10, 3600)])
        # Verify before uniqueness/password validation to avoid exposing account
        # registration information to requests that have not passed the challenge.
        verify_turnstile(request.data.get('turnstile_token') if isinstance(request.data, Mapping) else None, 'register')
        if settings.REGISTRATION_VERIFY_EMAIL:
            data = request.data if isinstance(request.data, Mapping) else {}
            verification = RegistrationEmailSerializer(data={'email': data.get('email')})
            verification.is_valid(raise_exception=True)
            token = data.get('email_verification')
            require_verified_email(
                verification.validated_data['email'],
                token if isinstance(token, str) and len(token) <= 1024 else '',
            )
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        start_session = serializer.validated_data.get('start_session', False)
        if start_session and request.user.is_authenticated:
            raise PermissionDenied('Cierra tu sesión antes de crear otra cuenta.')
        try:
            with transaction.atomic():
                user = serializer.save()
                business_data = serializer.validated_data.get('business')
                business = create_business(user, business_data) if business_data else None
        except IntegrityError as exc:
            raise ValidationError('No se pudo registrar la cuenta con estos datos.') from exc
        result = UserSerializer(user).data
        if business:
            result['business_id'] = str(business.pk)
            if start_session:
                login(request, user, backend='django.contrib.auth.backends.ModelBackend')
                start_app_session(request.session)
        return Response(result, status=status.HTTP_201_CREATED)


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
        start_app_session(request.session)
        return Response({'user': {**SessionUserSerializer(user).data, **session_times(request.session)},
                         'csrfToken': get_token(request)})


class LogoutView(AuthView):
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(AuthView):
    def get(self, request):
        if STARTED not in request.session:
            start_app_session(request.session)
        return Response({**SessionUserSerializer(request.user).data, **session_times(request.session)})


class SessionActivityView(AuthView):
    def post(self, request):
        if not isinstance(request.data, Mapping) or type(request.data.get('interacted')) is not bool:
            raise ValidationError({'interacted': 'Indica si hubo interacción con la aplicación.'})
        if STARTED not in request.session:
            start_app_session(request.session)
        now = int(time())
        if now - request.session.get(LAST_SEEN, 0) >= 30:
            request.session[LAST_SEEN] = now
        if request.data['interacted'] and now - request.session[LAST_ACTIVITY] >= 30:
            request.session[LAST_ACTIVITY] = now
        return Response(session_times(request.session))
