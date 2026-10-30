from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from rest_framework import serializers

from config.api import StrictInputMixin

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email')
        read_only_fields = fields


class RegisterSerializer(StrictInputMixin, serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
    turnstile_token = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=2048, trim_whitespace=False)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'turnstile_token')

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
        return User.objects.create_user(**validated_data)


class LoginSerializer(StrictInputMixin, serializers.Serializer):
    turnstile_token = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=2048, trim_whitespace=False)
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)
