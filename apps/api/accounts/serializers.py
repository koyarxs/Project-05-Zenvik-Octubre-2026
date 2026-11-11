from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from rest_framework import serializers

from config.api import StrictInputMixin
from businesses.serializers import RegistrationBusinessSerializer

User = get_user_model()
REGISTRATION_PASSWORD_MIN_LENGTH = 15


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email')
        read_only_fields = fields


class SessionUserSerializer(UserSerializer):
    is_platform_admin = serializers.SerializerMethodField()

    def get_is_platform_admin(self, user):
        return user.is_active and user.is_staff and user.is_superuser

    class Meta(UserSerializer.Meta):
        fields = (*UserSerializer.Meta.fields, 'is_platform_admin')
        read_only_fields = fields


class RegisterSerializer(StrictInputMixin, serializers.ModelSerializer):
    business = RegistrationBusinessSerializer(write_only=True, required=False)
    start_session = serializers.BooleanField(write_only=True, required=False)
    password = serializers.CharField(
        write_only=True, trim_whitespace=False, min_length=REGISTRATION_PASSWORD_MIN_LENGTH,
        max_length=128, error_messages={'min_length': 'Usa al menos 15 caracteres.'},
    )
    turnstile_token = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=2048, trim_whitespace=False)
    email_verification = serializers.CharField(write_only=True, required=False, max_length=1024)

    class Meta:
        model = User
        fields = (
            'username', 'email', 'first_name', 'last_name', 'phone', 'password',
            'turnstile_token', 'email_verification', 'business', 'start_session',
        )

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('No se puede utilizar este correo.')
        return value

    def validate(self, attrs):
        user = User(username=attrs['username'], email=attrs['email'])
        try:
            password_validation.validate_password(attrs['password'], user=user)
        except ValidationError as exc:
            raise serializers.ValidationError({'password': exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop('turnstile_token', None)
        validated_data.pop('email_verification', None)
        validated_data.pop('business', None)
        validated_data.pop('start_session', None)
        return User.objects.create_user(**validated_data)


class RegistrationEmailSerializer(StrictInputMixin, serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    turnstile_token = serializers.CharField(write_only=True, required=False, max_length=2048)


class LoginSerializer(StrictInputMixin, serializers.Serializer):
    turnstile_token = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=2048, trim_whitespace=False)
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
