"""Read and export access survives suspension. New writes require paid rights.

Call capacity checks under the Business row lock shared by every writer.
Absent subscriptions preserve unconfigured local businesses, not paid access.
"""
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from .models import FEATURES, Subscription


def rights(business):
    sub = Subscription.objects.select_related('version').filter(business=business).first()
    if not sub or sub.legacy_access:
        return {'legacy': True, 'writable': True, 'features': list(FEATURES), 'limits': {}}
    if sub.period_end and sub.period_end <= timezone.now():
        from .services import get_subscription
        sub = get_subscription(business.pk)
    valid = (sub.state in ('ACTIVE', 'TRIALING', 'PAST_DUE') and sub.period_start
             and sub.period_start <= timezone.now() < sub.period_end)
    return {'legacy': False, 'writable': bool(valid), 'features': sub.version.features if valid and sub.version else [],
            'limits': sub.version.limits if sub.version else {}}


def require_feature(business, feature):
    access = rights(business)
    if not access['writable'] or feature not in access['features']:
        raise PermissionDenied('Tu suscripción no permite esta operación. Puedes seguir consultando y recuperando tus datos.')


def check_capacity(business, kind, proposed):
    access = rights(business)
    if access['legacy']:
        return
    limit = access['limits'].get(kind)
    if limit is not None and proposed > limit:
        raise PermissionDenied('Alcanzaste el límite de tu plan. Los registros existentes se conservan; consulta Mi suscripción.')


def guard_request(request, business):
    # Authentication, active membership and role checks run before this commercial guard.
    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        return  # All original records and exports remain recoverable regardless of payment.
    path = request.path.split(str(business.pk), 1)[-1]
    if '/billing/' in path:
        return
    if '/attendance/' in path:
        feature = 'incidents' if '/incidents' in path else 'notifications' if '/notifications' in path else 'attendance'
    elif '/shifts' in path or '/planning-settings' in path:
        feature = 'shifts'
    elif '/leave-requests' in path:
        feature = 'leaves'
    else:
        feature = 'employees'
    require_feature(business, feature)


def usage(business):
    from businesses.models import Employee, Membership
    from attendance.models import AttendanceSite
    return {
        'active_employees': Employee.objects.filter(business=business, is_active=True).count(),
        'active_sites': AttendanceSite.objects.filter(business=business, is_active=True).count(),
        'administrators': Membership.objects.filter(business=business, is_active=True, access_enabled=True, role__in=['OWNER', 'ADMIN']).count(),
    }
