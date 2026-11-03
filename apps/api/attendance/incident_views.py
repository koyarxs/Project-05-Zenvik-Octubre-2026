from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from accounts.services import reserve_auth_attempt
from config.api import StrictInputMixin
from businesses.models import Shift, LeaveRequest
from businesses.permissions import MANAGER_ROLES
from .views import AttendanceBase
from .models import AttendanceIncident, IncidentDecision, AttendanceCorrection, AttendanceAudit, AttendanceNotification, AttendanceSession
from .serializers import SessionRead
from .services import person_for
from .incidents import CATEGORIES, STATES, policy_data, can_review, create_incident, decide_incident, configure, scan_incomplete

class DeclaredInstant(serializers.DateTimeField):
    def to_internal_value(self, value):
        import re
        if not isinstance(value, str) or not re.search(r'(Z|[+-][0-9]{2}:[0-9]{2})$', value):
            raise serializers.ValidationError('La hora declarada requiere una zona horaria explícita.')
        return super().to_internal_value(value)

class IncidentInput(StrictInputMixin, serializers.Serializer):
    request_id = serializers.UUIDField()
    session = serializers.UUIDField(allow_null=True, default=None)
    event = serializers.UUIDField(allow_null=True, default=None)
    shift = serializers.UUIDField(allow_null=True, default=None)
    work_date = serializers.DateField()
    category = serializers.RegexField(r'^[A-Z][A-Z0-9_]{0,47}$')
    event_type = serializers.ChoiceField(choices=['', 'CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT'], default='')
    declared_at = DeclaredInstant(allow_null=True, default=None)
    reason = serializers.CharField(min_length=10, max_length=1500)
    observations = serializers.CharField(max_length=1500, allow_blank=True, default='')

class DecisionInput(StrictInputMixin, serializers.Serializer):
    request_id = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)
    state = serializers.ChoiceField(choices=STATES[1:])
    reason = serializers.CharField(min_length=10, max_length=1500)

class PolicyInput(StrictInputMixin, serializers.Serializer):
    expected_version = serializers.IntegerField(min_value=0)
    request_days = serializers.IntegerField(min_value=0, max_value=36500, allow_null=True)
    admin_review_enabled = serializers.BooleanField()
    notifications_enabled = serializers.BooleanField()
    exceptional_alerts = serializers.BooleanField()
    incomplete_after_minutes = serializers.IntegerField(min_value=0, max_value=44640, allow_null=True)
    categories = serializers.DictField(child=serializers.CharField(max_length=100), allow_empty=False)
    review_guidance = serializers.CharField(max_length=1000, allow_blank=True)
    def validate_categories(self, value):
        import re
        if len(value) > 30 or any(not re.fullmatch(r'[A-Z][A-Z0-9_]{0,47}', key) for key in value):
            raise serializers.ValidationError('Usa hasta 30 categorías con códigos estables en mayúsculas.')
        return value

class Filters(StrictInputMixin, serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    search = serializers.CharField(max_length=100, allow_blank=True, default='')
    employee = serializers.UUIDField(required=False)
    session = serializers.UUIDField(required=False)
    category = serializers.CharField(max_length=48, required=False)
    status = serializers.ChoiceField(choices=STATES, required=False)
    ordering = serializers.ChoiceField(choices=['created_at', '-created_at', 'work_date', '-work_date'], default='-created_at')
    def validate(self, data):
        if data.get('date_from') and data.get('date_to') and data['date_from'] > data['date_to']:
            raise serializers.ValidationError('El rango de fechas no es válido.')
        return data

class CorrectionRead(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.username')
    class Meta:
        model = AttendanceCorrection
        fields = ['id', 'original_at', 'declared_at', 'approved_at', 'applied_at', 'reason', 'state', 'actor_name']

class DecisionRead(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.username')
    class Meta:
        model = IncidentDecision
        fields = ['id', 'actor_name', 'recorded_at', 'previous_state', 'state', 'reason', 'version', 'request_id']

class IncidentRead(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    business_name = serializers.CharField(source='business.name')
    correction = CorrectionRead(read_only=True)
    def get_employee_name(self, obj):
        return str(obj.employee)
    class Meta:
        model = AttendanceIncident
        fields = ['id', 'business', 'business_name', 'employee', 'employee_name', 'session', 'event', 'shift', 'work_date', 'category', 'category_label', 'event_type', 'declared_at', 'reason', 'observations', 'status', 'version', 'created_at', 'updated_at', 'correction']

class IncidentBase(AttendanceBase):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        reserve_auth_attempt([(f'incidents:{request.user.pk}:{self.business.pk}:{request.method}', 120 if request.method == 'GET' else 30, 60)])
    def scoped(self):
        rows = AttendanceIncident.objects.filter(business=self.business).select_related('business', 'employee', 'session', 'event', 'shift', 'correction__actor')
        return rows if self.member.role in MANAGER_ROLES else rows.filter(requester=self.request.user)
    def filtered(self):
        inputs = Filters(data=self.request.query_params); inputs.is_valid(raise_exception=True); data = inputs.validated_data
        rows = self.scoped()
        for key, lookup in [('date_from','work_date__gte'), ('date_to','work_date__lte'), ('employee','employee_id'), ('session','session_id'), ('category','category'), ('status','status')]:
            if key in data:
                rows = rows.filter(**{lookup: data[key]})
        if data['search']:
            rows = rows.filter(Q(employee__first_name__icontains=data['search']) | Q(employee__last_name__icontains=data['search']) | Q(category_label__icontains=data['search']) | Q(reason__icontains=data['search']))
        return rows.order_by(data['ordering'], 'pk')

class IncidentList(IncidentBase):
    def get(self, request, **kwargs):
        rows = self.filtered()
        summary = dict(rows.order_by().values_list('status').annotate(total=Count('pk')))
        response = self.get_paginated_response(IncidentRead(self.paginate_queryset(rows), many=True).data)
        response.data.update(summary=summary, policy=policy_data(self.business))
        return response
    def post(self, request, **kwargs):
        item = IncidentInput(data=request.data); item.is_valid(raise_exception=True)
        incident, created = create_incident(request.user, self.business.pk, item.validated_data)
        return Response(IncidentRead(self.scoped().get(pk=incident.pk)).data, status=201 if created else 200)

class IncidentDetail(IncidentBase):
    def get(self, request, pk, **kwargs):
        item = get_object_or_404(self.scoped(), pk=pk)
        result = dict(IncidentRead(item).data)
        policy = policy_data(self.business)
        result.update(decisions=DecisionRead(item.decisions.select_related('actor'), many=True).data,
            original_session=SessionRead(item.session).data if item.session else None,
            planned_shift={'id': str(item.shift_id), 'starts_at': item.shift.starts_at, 'ends_at': item.shift.ends_at} if item.shift else None,
            approved_leave=LeaveRequest.objects.filter(business=self.business, employee=item.employee, status='APPROVED', start_date__lte=item.work_date, end_date__gte=item.work_date).exists(),
            can_cancel=item.requester_id == request.user.pk and item.status == 'PENDING',
            can_review=can_review(self.member, policy) and item.requester_id != request.user.pk and item.employee.user_id != request.user.pk and item.status in ['PENDING','IN_REVIEW'],
            review_guidance=policy['review_guidance'], official_application_enabled=False)
        return Response(result)

class IncidentTransition(IncidentBase):
    def post(self, request, pk, **kwargs):
        data = DecisionInput(data=request.data); data.is_valid(raise_exception=True)
        item, created = decide_incident(request.user, self.business.pk, pk, data.validated_data)
        return Response(IncidentRead(self.scoped().get(pk=item.pk)).data, status=201 if created else 200)

class IncidentPolicyView(IncidentBase):
    def get(self, request, **kwargs):
        return Response(policy_data(self.business))
    def put(self, request, **kwargs):
        data = PolicyInput(data=request.data); data.is_valid(raise_exception=True)
        return Response(configure(request.user, self.business.pk, data.validated_data))

class IncidentContext(IncidentBase):
    def get(self, request, **kwargs):
        class Input(StrictInputMixin, serializers.Serializer):
            date = serializers.DateField()
        data = Input(data=request.query_params); data.is_valid(raise_exception=True)
        day = data.validated_data['date']
        if not 2000 <= day.year <= 2100:
            raise serializers.ValidationError('Fecha fuera del rango técnico.')
        person = person_for(request.user, self.business)
        if not person:
            return Response({'eligible': False, 'sessions': [], 'shifts': []})
        start = datetime.combine(day, time.min, tzinfo=ZoneInfo(self.business.planning_timezone))
        sessions = AttendanceSession.objects.filter(business=self.business, employee=person, user=request.user, work_date=day).prefetch_related('events').order_by('-created_at', 'pk')
        shifts = Shift.objects.filter(business=self.business, employee=person, starts_at__gte=start, starts_at__lt=start+timedelta(days=1)).order_by('starts_at', 'pk')
        return Response({'eligible': True, 'sessions': SessionRead(sessions[:50], many=True).data,
            'shifts': list(shifts.values('id','starts_at','ends_at')[:50]), 'limited': sessions.count() > 50 or shifts.count() > 50})

class CorrectionsView(IncidentBase):
    def get(self, request, **kwargs):
        rows = self.filtered().filter(correction__isnull=False)
        return self.get_paginated_response(IncidentRead(self.paginate_queryset(rows), many=True).data)

class AuditView(IncidentBase):
    def get(self, request, **kwargs):
        if self.member.role not in MANAGER_ROLES:
            raise PermissionDenied()
        class Input(StrictInputMixin, serializers.Serializer):
            page = serializers.IntegerField(min_value=1, default=1)
            action = serializers.CharField(max_length=48, required=False)
            resource_id = serializers.CharField(max_length=64, required=False)
        data = Input(data=request.query_params); data.is_valid(raise_exception=True)
        rows = AttendanceAudit.objects.filter(business=self.business).select_related('actor').order_by('-recorded_at', '-pk')
        for key in ['action','resource_id']:
            if key in data.validated_data:
                rows = rows.filter(**{key: data.validated_data[key]})
        return self.get_paginated_response([{'id': str(row.pk), 'actor': row.actor.get_username() if row.actor else 'Sistema', 'action': row.action, 'recorded_at': row.recorded_at, 'resource_type': row.resource_type, 'resource_id': row.resource_id, 'correlation_id': row.correlation_id, 'details': row.details} for row in self.paginate_queryset(rows)])

class NotificationsView(IncidentBase):
    def visible(self):
        rows = AttendanceNotification.objects.filter(business=self.business, recipient=self.request.user)
        if not can_review(self.member, policy_data(self.business)):
            rows = rows.filter(manager_only=False)
        return rows
    def get(self, request, **kwargs):
        class Input(StrictInputMixin, serializers.Serializer):
            page = serializers.IntegerField(min_value=1, default=1)
            unread = serializers.BooleanField(default=False)
        data = Input(data=request.query_params); data.is_valid(raise_exception=True)
        rows = self.visible()
        unread = rows.filter(read_at__isnull=True).count()
        if data.validated_data['unread']:
            rows = rows.filter(read_at__isnull=True)
        rows = rows.order_by('-created_at','-pk')
        response = self.get_paginated_response(list(self.paginate_queryset(rows.values('id','code','incident_id','session_id','manager_only','created_at','read_at'))))
        response.data['unread_count'] = unread
        return response

class NotificationRead(NotificationsView):
    def post(self, request, pk, **kwargs):
        class Input(StrictInputMixin, serializers.Serializer):
            pass
        data = Input(data=request.data); data.is_valid(raise_exception=True)
        item = get_object_or_404(self.visible(), pk=pk)
        self.visible().filter(pk=item.pk, read_at__isnull=True).update(read_at=timezone.now())
        return Response({'read': True})

class ScanAlertsView(IncidentBase):
    def post(self, request, **kwargs):
        if self.member.role not in MANAGER_ROLES:
            raise PermissionDenied()
        reserve_auth_attempt([(f'incident-scan:{self.business.pk}', 2, 60)])
        return Response({'created': scan_incomplete(self.business)})
