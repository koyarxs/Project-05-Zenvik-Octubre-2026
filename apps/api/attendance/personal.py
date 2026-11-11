"""Personal portal adapters; existing administrative endpoints keep their scope."""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from businesses.leave_views import LeaveActionView, LeaveDetailView, LeaveListCreateView
from .incident_views import (
    CorrectionsView, IncidentDetail, IncidentList, IncidentPolicyView,
    IncidentTransition, NotificationRead, NotificationsView,
)
from .models import AttendanceEvent
from .serializers import EventRead
from .views import AttendanceBase, CurrentView


class SubmissionView(AttendanceBase):
    """An absent result is not a rejection: the original transaction may be in flight."""

    def get(self, request, request_id, **kwargs):
        event = get_object_or_404(
            AttendanceEvent.objects.select_related('session'), business=self.business, actor=request.user, request_id=request_id,
        )
        return Response({'receipt': EventRead(event).data})


class PersonalCurrentView(CurrentView):
    def get(self, request, **kwargs):
        response = super().get(request, **kwargs)
        # The worker needs capture requirements, not site coordinates or retention settings.
        response.data['policy'] = {
            key: response.data['policy'][key]
            for key in ('version', 'location_required', 'max_accuracy_meters')
        }
        return response


class OwnIncidents:
    def scoped(self):
        return super().scoped().filter(requester=self.request.user)


class PersonalIncidentList(OwnIncidents, IncidentList):
    pass


class PersonalIncidentDetail(OwnIncidents, IncidentDetail):
    def get(self, request, **kwargs):
        response = super().get(request, **kwargs)
        response.data['can_review'] = False
        return response


class PersonalIncidentTransition(OwnIncidents, IncidentTransition):
    def post(self, request, pk, **kwargs):
        get_object_or_404(self.scoped(), pk=pk)
        if request.data.get('state') != 'CANCELLED':
            raise PermissionDenied('El portal personal solo permite cancelar solicitudes propias.')
        return super().post(request, pk, **kwargs)


class PersonalCorrections(OwnIncidents, CorrectionsView):
    pass


class PersonalIncidentPolicy(IncidentPolicyView):
    http_method_names = ['get', 'head', 'options']


class OwnNotifications:
    def visible(self):
        return super().visible().filter(manager_only=False)


class PersonalNotifications(OwnNotifications, NotificationsView):
    pass


class PersonalNotificationRead(OwnNotifications, NotificationRead):
    pass


class OwnLeaves:
    def get_queryset(self):
        return super().get_queryset().filter(requested_by=self.request.user)


class PersonalLeaves(OwnLeaves, LeaveListCreateView):
    pass


class PersonalLeaveDetail(OwnLeaves, LeaveDetailView):
    pass


class PersonalLeaveCancel(OwnLeaves, LeaveActionView):
    action = 'cancel'
