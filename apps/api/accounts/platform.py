from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from billing.models import BillingAudit, Plan
from businesses.models import Business

from .views import AuthView


class PlatformOverviewView(AuthView):
    def get(self, request):
        user = request.user
        if not (user.is_active and user.is_staff and user.is_superuser):
            raise PermissionDenied()

        businesses = Business.objects.order_by('name', 'pk')
        users = get_user_model().objects.order_by('username', 'pk')
        plans = Plan.objects.all()
        query = request.query_params.get('q', '').strip()[:150]
        return Response({
            'totals': {'businesses': businesses.count(), 'users': users.count(), 'plans': plans.count()},
            'businesses': list(businesses.filter(Q(name__icontains=query) | Q(rut__icontains=query))
                               .values('id', 'name', 'rut', 'is_active')[:20]),
            'users': list(users.filter(username__icontains=query).values('id', 'username', 'is_active')[:20]),
            'plans': list(plans.values('id', 'name', 'code', 'published')[:20]),
            'audit': list(BillingAudit.objects.order_by('-created_at', '-pk')
                          .values('id', 'action', 'created_at')[:20]),
        })
