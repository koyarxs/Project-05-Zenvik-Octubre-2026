from django.urls import path
from .views import ChangeView, CheckoutView, PaymentsView, SubscriptionView

urlpatterns = [
    path('', SubscriptionView.as_view()),
    path('payments/', PaymentsView.as_view()),
    path('checkout/', CheckoutView.as_view()),
    path('changes/', ChangeView.as_view()),
]
