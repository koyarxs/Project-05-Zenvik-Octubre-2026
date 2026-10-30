from django.shortcuts import get_object_or_404
from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import Membership

MANAGER_ROLES = (Membership.Role.OWNER, Membership.Role.ADMIN)


def active_membership(user, business_id):
    return get_object_or_404(
        Membership.objects.select_related('business'),
        user=user, business_id=business_id, is_active=True, business__is_active=True,
    )


class BusinessScopedPermission(BasePermission):
    def has_permission(self, request, view):
        membership = active_membership(request.user, view.kwargs['business_id'])
        view.membership = membership
        view.business = membership.business
        return request.method in SAFE_METHODS or membership.role in MANAGER_ROLES
