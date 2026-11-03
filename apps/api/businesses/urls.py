from django.urls import path

from .views import BusinessDetailView, BusinessListCreateView, EmployeeDetailView, EmployeeListCreateView
from .shift_views import ShiftDetailView, ShiftListCreateView, ShiftBatchView, ShiftHistoryView, PlanningSettingsView
from .leave_views import LeaveActionView, LeaveDetailView, LeaveListCreateView
from .dashboard_views import DashboardView

from .personnel_views import EmployeeHistoryView, EmployeeImpactView, JobTitlesView, BusinessAccountsView, EmployeeAccessView

urlpatterns = [
    path('<uuid:business_id>/job-titles/', JobTitlesView.as_view()),
    path('<uuid:business_id>/accounts/', BusinessAccountsView.as_view()),
    path('<uuid:business_id>/employees/<uuid:pk>/history/', EmployeeHistoryView.as_view()),
    path('<uuid:business_id>/employees/<uuid:pk>/impact/', EmployeeImpactView.as_view()),
    path('<uuid:business_id>/employees/<uuid:pk>/access/', EmployeeAccessView.as_view()),
    path('<uuid:business_id>/dashboard/', DashboardView.as_view()),
    path('<uuid:business_id>/leave-requests/', LeaveListCreateView.as_view()),
    path('<uuid:business_id>/leave-requests/<uuid:pk>/', LeaveDetailView.as_view()),
    path('<uuid:business_id>/leave-requests/<uuid:pk>/approve/', LeaveActionView.as_view(action='approve')),
    path('<uuid:business_id>/leave-requests/<uuid:pk>/reject/', LeaveActionView.as_view(action='reject')),
    path('<uuid:business_id>/leave-requests/<uuid:pk>/cancel/', LeaveActionView.as_view(action='cancel')),
    path('', BusinessListCreateView.as_view()),
    path('<uuid:pk>/', BusinessDetailView.as_view()),
    path('<uuid:business_id>/employees/', EmployeeListCreateView.as_view()),
    path('<uuid:business_id>/employees/<uuid:pk>/', EmployeeDetailView.as_view()),
    path('<uuid:business_id>/shifts/', ShiftListCreateView.as_view()),
    path('<uuid:business_id>/planning-settings/', PlanningSettingsView.as_view()),
    path('<uuid:business_id>/shifts/batch/', ShiftBatchView.as_view()),
    path('<uuid:business_id>/shifts/<uuid:pk>/history/', ShiftHistoryView.as_view()),
    path('<uuid:business_id>/shifts/<uuid:pk>/', ShiftDetailView.as_view()),
]
