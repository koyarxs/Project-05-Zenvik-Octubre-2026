from django.urls import path

from .views import BusinessDetailView, BusinessListCreateView, EmployeeDetailView, EmployeeListCreateView
from .shift_views import ShiftDetailView, ShiftListCreateView
from .leave_views import LeaveActionView, LeaveDetailView, LeaveListCreateView

urlpatterns = [
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
    path('<uuid:business_id>/shifts/<uuid:pk>/', ShiftDetailView.as_view()),
]
