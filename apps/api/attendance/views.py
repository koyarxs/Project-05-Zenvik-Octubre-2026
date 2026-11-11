from zoneinfo import ZoneInfo
from datetime import datetime, time, timedelta
from django.conf import settings
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from accounts.services import reserve_auth_attempt
from businesses.permissions import MANAGER_ROLES, active_membership
from .models import AttendanceEvent, AttendanceSession, AttendanceRejection
from .serializers import EventInput, EventRead, HistoryInput, PolicyInput, SessionRead
from .services import Conflict, TRANSITIONS, configure_policy, person_for, planned_shift, policy_data, record_event, shift_data


class AttendancePermission(BasePermission):
    def has_permission(self, request, view):
        view.member = active_membership(request.user, view.kwargs['business_id'])
        view.business = view.member.business
        from billing.access import guard_request
        guard_request(request, view.business)
        if settings.PRODUCTION and not request.is_secure():
            raise PermissionDenied('Asistencia requiere una conexión HTTPS segura.')
        return True


class HistoryPagination(PageNumberPagination):
    page_size = 10


@method_decorator(never_cache, name='dispatch')
class AttendanceBase(generics.GenericAPIView):
    permission_classes = [IsAuthenticated, AttendancePermission]
    pagination_class = HistoryPagination

    def own_sessions(self):
        return AttendanceSession.objects.filter(business=self.business, user=self.request.user).prefetch_related(
            Prefetch('events', queryset=AttendanceEvent.objects.order_by('sequence'))).order_by('-created_at', '-id')


class CurrentView(AttendanceBase):
    def get(self, request, **kwargs):
        now = timezone.now()
        today = now.astimezone(ZoneInfo(self.business.planning_timezone)).date()
        person = person_for(request.user, self.business, active=False)
        sessions = self.own_sessions()
        current = sessions.exclude(state='FINISHED').first() or sessions.filter(work_date=today).first()
        state = current.state if current else 'NOT_STARTED'
        allowed = list(TRANSITIONS[state]) if current else ['CLOCK_IN']
        if not person or not person.is_active:
            allowed = []
        zone = ZoneInfo(self.business.planning_timezone)
        day_start = datetime.combine(today, time.min, tzinfo=zone)
        day_end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=zone)
        today_events = AttendanceEvent.objects.filter(business=self.business, actor=request.user, recorded_at__gte=day_start, recorded_at__lt=day_end).select_related('session').order_by('-recorded_at', '-sequence')
        return Response({'server_now': now.isoformat(), 'date': today.isoformat(), 'timezone': self.business.planning_timezone,
            'employee_name': str(person) if person else None, 'eligible': bool(person and person.is_active), 'state': state,
            'allowed_actions': allowed, 'session': SessionRead(current).data if current else None,
            'planned_shift': shift_data(planned_shift(person, self.business, now)), 'policy': policy_data(self.business),
            'today_events': EventRead(today_events[:50], many=True).data})


class EventsView(AttendanceBase):
    def post(self, request, **kwargs):
        reserve_auth_attempt([(f'attendance:{request.user.pk}:{self.business.pk}', 30, 60)])
        serializer = EventInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            event, created = record_event(request.user, self.business.pk, serializer.validated_data)
        except Conflict:
            person = person_for(request.user, self.business)
            if person:
                duplicate = AttendanceEvent.objects.filter(business=self.business, actor=request.user, request_id=serializer.validated_data['request_id']).exists()
                AttendanceRejection.objects.create(business=self.business, employee=person, actor=request.user,
                    event_type=serializer.validated_data['event_type'], code='DUPLICATE_REJECTED' if duplicate else 'TRANSITION_REJECTED')
            raise
        return Response({'receipt': EventRead(event).data, 'replayed': not created}, status=201 if created else 200)


class HistoryView(AttendanceBase):
    def get(self, request, **kwargs):
        serializer = HistoryInput(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        rows = self.own_sessions()
        for field, lookup in [('date_from', 'work_date__gte'), ('date_to', 'work_date__lte')]:
            if field in serializer.validated_data:
                rows = rows.filter(**{lookup: serializer.validated_data[field]})
        return self.get_paginated_response(SessionRead(self.paginate_queryset(rows), many=True).data)


class ReceiptView(AttendanceBase):
    def get(self, request, pk, **kwargs):
        event = get_object_or_404(AttendanceEvent.objects.select_related('session'), pk=pk, business=self.business, actor=request.user)
        return Response(EventRead(event).data)


class PolicyView(AttendanceBase):
    def get(self, request, **kwargs):
        return Response(policy_data(self.business))

    def put(self, request, **kwargs):
        if self.member.role not in MANAGER_ROLES:
            raise PermissionDenied('Solo la administración puede configurar la política.')
        serializer = PolicyInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(configure_policy(request.user, self.business.pk, serializer.validated_data))
