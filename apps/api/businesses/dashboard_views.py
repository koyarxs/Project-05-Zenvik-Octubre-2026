"""Bounded operational previews; full paginated records remain in their modules."""
from datetime import datetime, time, timedelta

from django.db.models import Count, Q, Prefetch
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Employee, LeaveRequest, Shift
from .permissions import BusinessScopedPermission, MANAGER_ROLES
from .shift_serializers import SANTIAGO, ShiftSerializer


@method_decorator(never_cache, name='dispatch')
class DashboardView(APIView):
    permission_classes = [IsAuthenticated, BusinessScopedPermission]
    http_method_names = ['get', 'head', 'options']

    def get(self, request, business_id):
        now = timezone.now()
        today = now.astimezone(SANTIAGO).date()
        boundaries = [datetime.combine(today + timedelta(days=i), time.min, tzinfo=SANTIAGO) for i in range(8)]
        manager = self.membership.role in MANAGER_ROLES
        all_shifts = Shift.objects.filter(business=self.business, status='SCHEDULED')
        all_requests = LeaveRequest.objects.filter(business=self.business)
        if not manager:
            all_shifts = all_shifts.filter(employee__user=request.user)
            all_requests = all_requests.filter(requested_by=request.user)
        shifts = all_shifts.filter(starts_at__lt=boundaries[7], ends_at__gt=boundaries[0])
        pending = LeaveRequest.objects.filter(business=self.business, status='PENDING')
        if not manager:
            shifts = shifts.filter(employee__user=request.user)
            pending = pending.filter(requested_by=request.user)
        counts = shifts.aggregate(total=Count('id'), **{
            f'day_{i}': Count('id', filter=Q(starts_at__lt=boundaries[i + 1], ends_at__gt=boundaries[i])) for i in range(7)
        })
        def preview(queryset):
            return queryset.select_related('employee', 'business').prefetch_related(Prefetch('employee__leave_requests', queryset=LeaveRequest.objects.filter(business=self.business, status='APPROVED'), to_attr='planning_leaves')).order_by('starts_at', 'id')
        ordered = preview(shifts)
        person = Employee.objects.filter(business=self.business, user=request.user).first() if not manager else None
        next_shift = preview(all_shifts.filter(ends_at__gt=now)).first() if not manager else None
        request_counts = all_requests.aggregate(**{status: Count('id', filter=Q(status=status)) for status in LeaveRequest.Status.values}) if not manager else None
        # Only fields rendered by the preview: no reasons, emails or review notes.
        requests = pending.select_related('employee').order_by('created_at', 'id')[:4]
        team = None
        if manager:
            team = Employee.objects.filter(business=self.business).aggregate(
                total=Count('id'), active=Count('id', filter=Q(is_active=True)),
            )
            team['scheduled_today'] = shifts.filter(starts_at__lt=boundaries[1]).values('employee_id').distinct().count()
            team['on_leave'] = all_requests.filter(
                status='APPROVED', start_date__lte=today, end_date__gte=today,
            ).values('employee_id').distinct().count()
        return Response({
            'date': today.isoformat(), 'server_now': now.isoformat(), 'timezone': self.business.planning_timezone,
            'worker_profile': {'id': str(person.pk), 'first_name': person.first_name, 'last_name': person.last_name, 'job_title': person.job_title, 'is_active': person.is_active} if person else None,
            'next_shift': ShiftSerializer(next_shift).data if next_shift else None,
            'request_counts': request_counts,
            'active_employees': team['active'] if team is not None else None,
            'team_summary': team,
            'today_count': counts['day_0'], 'week_count': counts['total'],
            'pending_count': pending.count(),
            'today_shifts': ShiftSerializer(ordered.filter(starts_at__lt=boundaries[1])[:6], many=True).data,
            'upcoming_shifts': ShiftSerializer(ordered.filter(ends_at__gt=now)[:6], many=True).data,
            'pending_requests': [{
                'id': str(row.pk), 'employee_name': str(row.employee), 'request_type': row.request_type,
                'start_date': row.start_date.isoformat(), 'end_date': row.end_date.isoformat(),
            } for row in requests],
            'days': [{'date': (today + timedelta(days=i)).isoformat(), 'count': counts[f'day_{i}']} for i in range(7)],
        })
