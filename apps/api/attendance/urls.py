from django.urls import path
from .views import CurrentView, EventsView, HistoryView, PolicyView, ReceiptView
from .supervision import RosterView, PersonView, ReviewView, ReportView
from .incident_views import IncidentList, IncidentDetail, IncidentTransition, IncidentPolicyView, IncidentContext, CorrectionsView, AuditView, NotificationsView, NotificationRead, ScanAlertsView
from . import personal

urlpatterns = [
    path('submissions/<uuid:request_id>/', personal.SubmissionView.as_view()),
    path('personal/current/', personal.PersonalCurrentView.as_view()),
    path('personal/incidents/', personal.PersonalIncidentList.as_view()),
    path('personal/incidents/context/', IncidentContext.as_view()),
    path('personal/incidents/policy/', personal.PersonalIncidentPolicy.as_view()),
    path('personal/incidents/corrections/', personal.PersonalCorrections.as_view()),
    path('personal/incidents/<uuid:pk>/', personal.PersonalIncidentDetail.as_view()),
    path('personal/incidents/<uuid:pk>/transition/', personal.PersonalIncidentTransition.as_view()),
    path('personal/notifications/', personal.PersonalNotifications.as_view()),
    path('personal/notifications/<uuid:pk>/read/', personal.PersonalNotificationRead.as_view()),
    path('personal/leave-requests/', personal.PersonalLeaves.as_view()),
    path('personal/leave-requests/<uuid:pk>/', personal.PersonalLeaveDetail.as_view()),
    path('personal/leave-requests/<uuid:pk>/cancel/', personal.PersonalLeaveCancel.as_view()),
    path('incidents/', IncidentList.as_view()),
    path('incidents/context/', IncidentContext.as_view()),
    path('incidents/policy/', IncidentPolicyView.as_view()),
    path('incidents/corrections/', CorrectionsView.as_view()),
    path('incidents/<uuid:pk>/', IncidentDetail.as_view()),
    path('incidents/<uuid:pk>/transition/', IncidentTransition.as_view()),
    path('audit/', AuditView.as_view()),
    path('notifications/', NotificationsView.as_view()),
    path('notifications/<uuid:pk>/read/', NotificationRead.as_view()),
    path('notifications/scan/', ScanAlertsView.as_view()),
    path('supervision/', RosterView.as_view()),
    path('supervision/people/<uuid:pk>/', PersonView.as_view()),
    path('supervision/reviews/<uuid:pk>/', ReviewView.as_view()),
    path('supervision/reports/', ReportView.as_view()),
    path('supervision/export/', ReportView.as_view(), {'export': True}),
    path('current/', CurrentView.as_view()),
    path('events/', EventsView.as_view()),
    path('history/', HistoryView.as_view()),
    path('receipts/<uuid:pk>/', ReceiptView.as_view()),
    path('policy/', PolicyView.as_view()),
]
