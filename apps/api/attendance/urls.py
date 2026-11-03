from django.urls import path
from .views import CurrentView, EventsView, HistoryView, PolicyView, ReceiptView
from .supervision import RosterView, PersonView, ReviewView, ReportView
from .incident_views import IncidentList, IncidentDetail, IncidentTransition, IncidentPolicyView, IncidentContext, CorrectionsView, AuditView, NotificationsView, NotificationRead, ScanAlertsView

urlpatterns = [
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
