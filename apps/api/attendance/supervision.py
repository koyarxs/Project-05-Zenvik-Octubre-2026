"""Manager-only supervision. Originals are never updated by this module."""
import csv
import io
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import DateTimeField, F, Case, When, Value, CharField, Exists, OuterRef, Subquery, Q, Count
from django.db.models.functions import Cast, Coalesce, ExtractHour
from django.db.models.fields.json import KeyTextTransform
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from config.api import StrictInputMixin
from accounts.services import reserve_auth_attempt
from businesses.models import Business, Employee, Shift, LeaveRequest
from businesses.permissions import MANAGER_ROLES, active_membership
from .models import AttendanceSession, AttendanceEvent, AttendanceReview, AttendanceRejection
from .views import AttendanceBase, AttendancePermission
from .serializers import SessionRead
from .services import Conflict, distance_meters

STATES = ['WORKING', 'ON_BREAK', 'FINISHED', 'LEAVE', 'PENDING', 'FUTURE', 'UNSCHEDULED']

class Filters(StrictInputMixin, serializers.Serializer):
    date = serializers.DateField(required=False)
    period = serializers.ChoiceField(choices=['daily', 'weekly', 'monthly'], default='daily')
    search = serializers.CharField(max_length=100, required=False, allow_blank=True)
    job_title = serializers.CharField(max_length=120, required=False, allow_blank=True)
    state = serializers.ChoiceField(choices=STATES, required=False)
    ordering = serializers.ChoiceField(choices=['last_name', '-last_name', 'job_title'], default='last_name')
    page = serializers.IntegerField(min_value=1, required=False)
    dashboard = serializers.BooleanField(required=False, default=False)

class ReviewInput(StrictInputMixin, serializers.Serializer):
    state = serializers.ChoiceField(choices=['PENDING', 'REVIEWING', 'RESOLVED'])
    reason = serializers.CharField(min_length=10, max_length=1000)
    expected_review = serializers.IntegerField(min_value=0)

class ManagerPermission(AttendancePermission):
    def has_permission(self, request, view):
        super().has_permission(request, view)
        if view.member.role not in MANAGER_ROLES:
            raise PermissionDenied('Solo OWNER y ADMIN pueden supervisar asistencia.')
        group = 'reports' if view.__class__.__name__ == 'ReportView' else 'read'
        reserve_auth_attempt([(f'attendance-supervision:{request.user.pk}:{view.business.pk}:{group}', 12 if group == 'reports' else 120, 60)])
        return True

class ManagerBase(AttendanceBase):
    permission_classes = [*AttendanceBase.permission_classes[:1], ManagerPermission]

    def filters(self):
        item = Filters(data=self.request.query_params)
        item.is_valid(raise_exception=True)
        data = item.validated_data
        data.setdefault('date', timezone.now().astimezone(ZoneInfo(self.business.planning_timezone)).date())
        if not 2000 <= data['date'].year <= 2100:
            raise ValidationError('Fecha fuera del rango operativo 2000–2100.')
        return data


def roster(business, day, filters, now, include_open=True):
    zone = ZoneInfo(business.planning_timezone)
    start = datetime.combine(day, time.min, tzinfo=zone)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=zone)
    sessions = AttendanceSession.objects.filter(business=business, employee_id=OuterRef('pk'), work_date=day).order_by('-created_at', '-pk')
    # Today's supervision also surfaces an open overnight journey from an earlier work date.
    if include_open and day == now.astimezone(zone).date():
        sessions = AttendanceSession.objects.filter(business=business, employee_id=OuterRef('pk')).filter(Q(work_date=day) | ~Q(state='FINISHED')).order_by('-created_at', '-pk')
    shifts = Shift.objects.filter(business=business, employee_id=OuterRef('pk'), status='SCHEDULED', starts_at__gte=start, starts_at__lt=end).order_by('starts_at', 'pk')
    leave = LeaveRequest.objects.filter(business=business, employee_id=OuterRef('pk'), status='APPROVED', start_date__lte=day, end_date__gte=day)
    rows = Employee.objects.filter(business=business).annotate(session_id=Subquery(sessions.values('id')[:1]), session_state=Subquery(sessions.values('state')[:1]), planned_start=Subquery(shifts.values('starts_at')[:1]), planned_end=Subquery(shifts.values('ends_at')[:1]), approved_leave=Exists(leave))
    rows = rows.filter(Q(is_active=True) | Q(session_id__isnull=False) | Q(planned_start__isnull=False))
    snapshots = sessions.annotate(snapshot_start=Cast(KeyTextTransform('starts_at', 'shift_snapshot'), DateTimeField()), snapshot_end=Cast(KeyTextTransform('ends_at', 'shift_snapshot'), DateTimeField()))
    rows = rows.annotate(effective_start=Coalesce(Subquery(snapshots.values('snapshot_start')[:1]), F('planned_start')), effective_end=Coalesce(Subquery(snapshots.values('snapshot_end')[:1]), F('planned_end')))
    events = AttendanceEvent.objects.filter(business=business, session_id=OuterRef('session_id'))
    reviews = AttendanceReview.objects.filter(session_id=OuterRef('session_id')).order_by('-id')
    rejections = AttendanceRejection.objects.filter(business=business, employee_id=OuterRef('pk'), recorded_at__gte=start, recorded_at__lt=end)
    rows = rows.annotate(rejected_attempt=Exists(rejections))
    rows = rows.annotate(location_incident=Exists(events.exclude(geo_result__in=['INSIDE', 'NO_GEOFENCE'])), entry_at=Subquery(events.filter(event_type='CLOCK_IN').values('recorded_at')[:1]), latest_review=Subquery(reviews.values('state')[:1]))
    rows = rows.annotate(operational_state=Case(When(session_state__isnull=False, then='session_state'), When(approved_leave=True, then=Value('LEAVE')), When(planned_start__lte=now, then=Value('PENDING')), When(planned_start__gt=now, then=Value('FUTURE')), default=Value('UNSCHEDULED'), output_field=CharField()))
    if filters.get('search'):
        rows = rows.filter(Q(first_name__icontains=filters['search']) | Q(last_name__icontains=filters['search']))
    if filters.get('job_title'):
        rows = rows.filter(job_title=filters['job_title'])
    if filters.get('state'):
        rows = rows.filter(operational_state=filters['state'])
    return rows.order_by(filters['ordering'], 'pk')


def session_info(session, now):
    data = dict(SessionRead(session).data)
    events = list(session.events.all())
    incidents = sorted({e.geo_result for e in events if e.geo_result not in ['INSIDE', 'NO_GEOFENCE']})
    if any(e.exception_reason for e in events):
        incidents.append('EXCEPTION')
    planned = session.shift_snapshot
    start = datetime.fromisoformat(planned['starts_at']) if planned.get('starts_at') else None
    end = datetime.fromisoformat(planned['ends_at']) if planned.get('ends_at') else None
    clock_in = next((e.recorded_at for e in events if e.event_type == 'CLOCK_IN'), None)
    clock_out = next((e.recorded_at for e in reversed(events) if e.event_type == 'CLOCK_OUT'), None)
    delta = round((clock_in-start).total_seconds()/60, 2) if start and clock_in else None
    if delta is not None and delta > 0:
        incidents.append('POSSIBLE_LATE')
    if end and end < now and not clock_out:
        incidents.append('INCOMPLETE')
    if any(a.recorded_at > b.recorded_at for a, b in zip(events, events[1:])):
        incidents.append('TEMPORAL')
    reviews = list(session.reviews.all())
    data.update(incidents=incidents, start_difference_minutes=delta, end_difference_minutes=round((clock_out-end).total_seconds()/60, 2) if end and clock_out else None,
        review_state=reviews[0].state if reviews else 'PENDING', review_version=reviews[0].pk if reviews else 0,
        reviews=[{'id': r.pk, 'actor': r.actor.get_username(), 'recorded_at': r.recorded_at, 'previous_state': r.previous_state, 'state': r.state, 'reason': r.reason} for r in reviews])
    # Only distances to historical business zones are disclosed, never employee coordinates.
    for output, event in zip(data['events'], events):
        output['sites'] = [{'name': site['name'], 'radius_meters': site['radius_meters'], 'distance_meters': round(distance_meters(event.latitude, event.longitude, site['latitude'], site['longitude']), 1) if event.latitude is not None else None} for site in event.policy_snapshot.get('sites', []) if site['is_active']]
    return data


def sessions_query(business):
    from django.db.models import Prefetch
    return AttendanceSession.objects.filter(business=business).prefetch_related(Prefetch('events', queryset=AttendanceEvent.objects.order_by('sequence')), Prefetch('reviews', queryset=AttendanceReview.objects.select_related('actor').order_by('-id')))


def serialize_rows(business, rows, now):
    rows = list(rows)
    sessions = {s.pk: s for s in sessions_query(business).filter(pk__in=[r.session_id for r in rows if r.session_id])}
    return [{'employee_id': str(r.pk), 'name': str(r), 'job_title': r.job_title, 'state': r.operational_state, 'approved_leave': r.approved_leave, 'rejected_attempt': r.rejected_attempt, 'planned_start': r.planned_start, 'planned_end': r.planned_end, 'session': session_info(sessions[r.session_id], now) if r.session_id else None} for r in rows]

class RosterView(ManagerBase):
    def get(self, request, **kwargs):
        filters = self.filters()
        now = timezone.now()
        rows = roster(self.business, filters['date'], filters, now)
        counts = dict(rows.order_by().values_list('operational_state').annotate(total=Count('pk')))
        indicators = rows.aggregate(rejected_attempts=Count('pk', filter=Q(rejected_attempt=True)), registered=Count('pk', filter=Q(session_id__isnull=False)), location_incidents=Count('pk', filter=Q(location_incident=True)), possible_late=Count('pk', filter=Q(entry_at__gt=F('effective_start'))), pending_review=Count('pk', filter=(Q(location_incident=True) | Q(entry_at__gt=F('effective_start')) | (Q(effective_end__lt=now) & Q(session_id__isnull=False) & ~Q(session_state='FINISHED'))) & (Q(latest_review__isnull=True) | ~Q(latest_review='RESOLVED'))))
        page = self.paginate_queryset(rows)
        response = self.get_paginated_response(serialize_rows(self.business, page, now))
        response.data.update(summary=counts, indicators=indicators, generated_at=now, date=filters['date'], timezone=self.business.planning_timezone)
        if filters['dashboard']:
            local_zone = ZoneInfo(self.business.planning_timezone)
            start = datetime.combine(filters['date'], time.min, tzinfo=local_zone)
            end = datetime.combine(filters['date'] + timedelta(days=1), time.min, tzinfo=local_zone)
            entries = AttendanceEvent.objects.filter(
                business=self.business, event_type='CLOCK_IN', recorded_at__gte=start, recorded_at__lt=end,
            ).annotate(hour=ExtractHour('recorded_at', tzinfo=local_zone)).values('hour').annotate(total=Count('pk'))
            by_hour = {row['hour']: row['total'] for row in entries}
            response.data['dashboard'] = {
                'entries': [{'hour': hour, 'count': by_hour.get(hour, 0) + by_hour.get(hour + 1, 0)}
                            for hour in range(0, 24, 2)],
                'completed_shifts': AttendanceSession.objects.filter(
                    business=self.business, state='FINISHED', shift__business=self.business,
                    shift__status='SCHEDULED', shift__starts_at__lt=end, shift__ends_at__gt=start,
                ).values('shift_id').distinct().count(),
            }
        return response

class PersonView(ManagerBase):
    def get(self, request, pk, **kwargs):
        filters = self.filters()
        person = get_object_or_404(Employee, pk=pk, business=self.business)
        sessions = sessions_query(self.business).filter(employee=person, work_date=filters['date']).order_by('-created_at', '-pk')
        page = self.paginate_queryset(sessions)
        response = self.get_paginated_response([session_info(s, timezone.now()) for s in page])
        start = datetime.combine(filters['date'], time.min, tzinfo=ZoneInfo(self.business.planning_timezone))
        rejections = AttendanceRejection.objects.filter(business=self.business, employee=person, recorded_at__gte=start, recorded_at__lt=start+timedelta(days=1)).order_by('-recorded_at', '-pk')
        response.data.update(rejections=list(rejections.values('id', 'event_type', 'code', 'recorded_at')[:20]), rejection_count=rejections.count(), name=str(person), job_title=person.job_title, business=self.business.name)
        return response

class ReviewView(ManagerBase):
    @transaction.atomic
    def post(self, request, pk, **kwargs):
        get_object_or_404(Business.objects.select_for_update(), pk=self.business.pk)
        if active_membership(request.user, self.business.pk).role not in MANAGER_ROLES:
            raise PermissionDenied()
        session = get_object_or_404(AttendanceSession, pk=pk, business=self.business)
        item = ReviewInput(data=request.data)
        item.is_valid(raise_exception=True)
        latest = session.reviews.first()
        if item.validated_data['expected_review'] != (latest.pk if latest else 0):
            raise Conflict('Otra persona revisó la jornada. Actualiza el detalle.')
        review = AttendanceReview.objects.create(session=session, actor=request.user, previous_state=latest.state if latest else 'PENDING', state=item.validated_data['state'], reason=item.validated_data['reason'])
        from .incidents import audit, policy_data as incident_policy, notify
        audit(self.business, request.user, 'JOURNEY_REVIEW_'+review.state, 'session', session.pk, {'review': review.pk, 'before': review.previous_state, 'after': review.state})
        if review.state == 'RESOLVED' and incident_policy(self.business)['notifications_enabled']:
            notify(self.business, session.user_id, 'JOURNEY_REVIEW_RESOLVED', f'review:{review.pk}', session=session)
        return Response({'id': review.pk}, status=201)

class ReportView(ManagerBase):
    def get(self, request, **kwargs):
        if not kwargs.get('export', False):
            from billing.access import require_feature
            require_feature(self.business, 'reports')
        filters = self.filters()
        day = filters['date']
        if filters['period'] == 'weekly':
            day -= timedelta(days=day.weekday())
            days = 7
        elif filters['period'] == 'monthly':
            import calendar
            day = day.replace(day=1)
            days = calendar.monthrange(day.year, day.month)[1]
        else:
            days = 1
        now = timezone.now()
        segments = []
        total = 0
        for offset in range(days):
            current = day + timedelta(days=offset)
            rows = roster(self.business, current, {k: v for k, v in filters.items() if k != 'state'}, now, include_open=False)
            sessions = sessions_query(self.business).filter(employee_id__in=rows.values('pk'), work_date=current).select_related('employee').order_by({'last_name': 'employee__last_name', '-last_name': '-employee__last_name', 'job_title': 'employee__job_title'}[filters['ordering']], 'employee_id', 'created_at', 'pk')
            sessions = sessions.annotate(approved_leave=Exists(LeaveRequest.objects.filter(business=self.business, employee_id=OuterRef('employee_id'), status='APPROVED', start_date__lte=current, end_date__gte=current)))
            missing = rows.filter(session_id__isnull=True)
            if filters.get('state'):
                sessions = sessions.filter(state=filters['state'])
                missing = missing.filter(operational_state=filters['state'])
            for kind, query in [('sessions', sessions), ('missing', missing)]:
                count = query.count()
                segments.append((current, kind, query, total, count))
                total += count
        exporting = kwargs.get('export', False)
        if exporting and total > 10000:
            raise ValidationError('El reporte supera 10.000 filas. Acota los filtros o el período.')
        # Paginate the virtual calendar in SQL before hydrating events/reviews.
        # There is no full-history download for an ordinary report page.
        if not exporting:
            self.paginate_queryset(range(total))
            low = (self.paginator.page.number - 1) * self.paginator.page_size
            high = low + self.paginator.page_size
        else:
            low, high = 0, total
        output = []
        for current, kind, query, offset, count in segments:
            left, right = max(0, low-offset), min(count, high-offset)
            if left >= right:
                continue
            if kind == 'missing':
                output.extend({'date': current.isoformat(), **row, 'incidents': []} for row in serialize_rows(self.business, query[left:right], now))
            else:
                for session in query[left:right]:
                    data = session_info(session, now)
                    output.append({'date': current.isoformat(), 'employee_id': str(session.employee_id), 'name': str(session.employee), 'job_title': session.employee.job_title, 'state': session.state, 'approved_leave': session.approved_leave, 'planned_start': session.shift_snapshot.get('starts_at'), 'planned_end': session.shift_snapshot.get('ends_at'), 'session': data, 'incidents': data['incidents']})
        if not exporting:
            result = self.get_paginated_response(output)
            result.data.update(generated_at=now, timezone=self.business.planning_timezone, date_from=day, days=days)
            return result
        stream = io.StringIO(newline='')
        writer = csv.writer(stream, delimiter=';')
        writer.writerow(['Negocio', 'Generado', 'Zona horaria', 'Filtros', 'Fecha', 'Trabajador', 'Cargo', 'Estado', 'Inicio programado', 'Fin programado', 'Entrada', 'Inicio colación', 'Fin colación', 'Salida', 'Diferencia entrada (min)', 'Incidencias'])
        def safe(value):
            value = str(value) if value is not None else ''
            return "'" + value if value.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else value
        for row in output:
            session = row['session'] or {}
            events = session.get('events', [])
            marks = [' | '.join(e['recorded_at'] for e in events if e['event_type'] == kind) for kind in ['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']]
            writer.writerow([safe(v) for v in [self.business.name, now.isoformat(), self.business.planning_timezone, str(dict(request.query_params)), row['date'], row['name'], row['job_title'], row['state'], session.get('shift_snapshot', {}).get('starts_at', row['planned_start']), session.get('shift_snapshot', {}).get('ends_at', row['planned_end']), *marks, session.get('start_difference_minutes'), ', '.join(row['incidents'])]])
        response = HttpResponse('\ufeff' + stream.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="asistencia.csv"'
        return response
