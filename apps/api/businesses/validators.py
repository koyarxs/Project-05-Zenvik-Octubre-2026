import re

from django.core.exceptions import ValidationError


def normalize_rut(value):
    """Return an optional RUT as digits-DV after checking its modulus 11 digit."""
    if not isinstance(value, str):
        raise ValidationError('Ingrese un RUT con formato válido.', code='invalid_rut')
    value = value.strip().upper()
    if not value:
        return ''
    if not re.fullmatch(r'(?:[0-9]{1,8}|[0-9]{1,2}(?:\.[0-9]{3}){1,2})-?[0-9K]', value):
        raise ValidationError('Ingrese un RUT con formato válido.', code='invalid_rut')
    compact = value.replace('.', '').replace('-', '')
    number, digit = compact[:-1], compact[-1]
    if len(number) > 8 or int(number) == 0:
        raise ValidationError('Ingrese un RUT con formato válido.', code='invalid_rut')
    total = sum(int(n) * (2 + i % 6) for i, n in enumerate(reversed(number)))
    remainder = 11 - total % 11
    expected = '0' if remainder == 11 else 'K' if remainder == 10 else str(remainder)
    if digit != expected:
        raise ValidationError('El dígito verificador del RUT es incorrecto.', code='invalid_rut')
    return f'{int(number)}-{digit}'
