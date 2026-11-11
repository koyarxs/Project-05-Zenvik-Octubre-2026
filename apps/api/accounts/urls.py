from django.urls import path

from .platform import PlatformOverviewView
from .views import CsrfView, LoginView, LogoutView, MeView, RegisterView, RegistrationEmailView, SessionActivityView

urlpatterns = [
    path('csrf/', CsrfView.as_view()),
    path('register/', RegisterView.as_view()),
    path('registration-email/', RegistrationEmailView.as_view()),
    path('login/', LoginView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('me/', MeView.as_view()),
    path('session-activity/', SessionActivityView.as_view()),
    path('platform-overview/', PlatformOverviewView.as_view()),
]
