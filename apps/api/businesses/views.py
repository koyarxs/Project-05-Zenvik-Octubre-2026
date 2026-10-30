from django.utils.decorators import method_decorator
from django.db.models import Q
from django.views.decorators.cache import never_cache
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import Business, Employee, Membership
from .permissions import BusinessScopedPermission
from .serializers import BusinessSerializer, EmployeeSerializer
from .services import create_business, write_employee
from .directory_serializers import EmployeeFilterSerializer


@method_decorator(never_cache, name='dispatch')
class BusinessListCreateView(generics.ListCreateAPIView):
    serializer_class = BusinessSerializer

    def get_queryset(self):
        return Business.objects.filter(
            memberships__user=self.request.user, memberships__is_active=True, is_active=True,
        ).order_by('created_at', 'id')

    def perform_create(self, serializer):
        serializer.instance = create_business(self.request.user, serializer.validated_data)


class BusinessDetailView(BusinessListCreateView, generics.RetrieveAPIView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)


@method_decorator(never_cache, name='dispatch')
class EmployeeListCreateView(generics.ListCreateAPIView):
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated, BusinessScopedPermission]

    def get_queryset(self):
        queryset = Employee.objects.filter(business=self.business).order_by('created_at', 'id')
        if self.membership.role == Membership.Role.EMPLOYEE:
            queryset = queryset.filter(user=self.request.user)
        filters = EmployeeFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        values = filters.validated_data
        if values.get('search'):
            for term in values['search'].split():
                queryset = queryset.filter(Q(first_name__icontains=term) | Q(last_name__icontains=term) | Q(email__icontains=term))
        if 'is_active' in values:
            queryset = queryset.filter(is_active=values['is_active'])
        return queryset

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'business': self.business}

    def perform_create(self, serializer):
        serializer.instance = write_employee(
            self.request.user, self.business.pk, serializer.validated_data,
        )


class EmployeeDetailView(EmployeeListCreateView, generics.RetrieveUpdateAPIView):
    http_method_names = ['get', 'patch', 'head', 'options']

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.instance = write_employee(
            self.request.user, self.business.pk, serializer.validated_data,
            employee_id=serializer.instance.pk,
        )
