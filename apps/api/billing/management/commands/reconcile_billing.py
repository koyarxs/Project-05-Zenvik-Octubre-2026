from django.core.management.base import BaseCommand
from billing.models import Subscription
from billing.services import get_subscription


class Command(BaseCommand):
    help = 'Aplica vencimientos y renovaciones ya pagadas. No realiza cobros.'

    def handle(self, *args, **options):
        count = 0
        for business_id in Subscription.objects.filter(legacy_access=False).values_list('business_id', flat=True).iterator():
            get_subscription(business_id)
            count += 1
        self.stdout.write(f'Suscripciones conciliadas: {count}. No se realizaron cobros.')
