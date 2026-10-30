from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics, mixins
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from .leave_serializers import LeaveCancelSerializer, LeaveCreateSerializer, LeaveDecisionSerializer, LeaveDetailSerializer, LeaveFilterSerializer, LeaveReadSerializer
from .leave_services import create_leave, decide_leave
from .models import LeaveRequest
from .permissions import MANAGER_ROLES, active_membership


class LeavePermission(BasePermission):
    def has_permission(self, request, view):
        view.membership = active_membership(request.user, view.kwargs['business_id'])
        view.business = view.membership.business
        return True  # Own writes are checked again under the business lock.


@method_decorator(never_cache, name='dispatch')
class LeaveBaseView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, LeavePermission]
    serializer_class = LeaveReadSerializer

    def get_queryset(self):
        queryset = LeaveRequest.objects.filter(business=self.business).select_related('employee', 'reviewed_by').order_by('-created_at', '-id')
        if self.membership.role not in MANAGER_ROLES:
            queryset = queryset.filter(requested_by=self.request.user)
        return queryset

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'membership': self.membership}


class LeaveListCreateView(mixins.ListModelMixin, LeaveBaseView):
    def get_queryset(self):
        queryset = super().get_queryset()
        filters = LeaveFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        values = filters.validated_data
        if 'employee' in values:
            queryset = queryset.filter(employee_id=values['employee'])
        if 'status' in values:
            queryset = queryset.filter(status=values['status'])
        if 'date_from' in values:
            queryset = queryset.filter(end_date__gte=values['date_from'])
        if 'date_to' in values:
            queryset = queryset.filter(start_date__lte=values['date_to'])
        return queryset

    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        serializer = LeaveCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        leave = create_leave(request.user, self.business.pk, serializer.validated_data)
        return Response(self.get_serializer(leave).data, status=201)


class LeaveDetailView(mixins.RetrieveModelMixin, LeaveBaseView):
    serializer_class = LeaveDetailSerializer

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)


class LeaveActionView(LeaveBaseView):
    action = None
    serializer_class = LeaveDetailSerializer

    def post(self, request, *args, **kwargs):
        self.get_object()  # Identical 404 policy for foreign/unknown objects.
        serializer = (LeaveCancelSerializer if self.action == 'cancel' else LeaveDecisionSerializer)(data=request.data)
        serializer.is_valid(raise_exception=True)
        leave = decide_leave(request.user, self.business.pk, self.kwargs['pk'], self.action, **serializer.validated_data)
        return Response(self.get_serializer(leave).data)
