from django.core.management.base import BaseCommand
from attendance.incidents import scan_incomplete
from attendance.models import IncidentPolicy

class Command(BaseCommand):
    help = 'Deliver configured incomplete-session alerts, idempotently. No events are modified.'
    def add_arguments(self, parser):
        parser.add_argument('--business', type=str)
    def handle(self, *args, **options):
        rows = IncidentPolicy.objects.filter(business__is_active=True, notifications_enabled=True, incomplete_after_minutes__isnull=False).select_related('business')
        if options['business']:
            rows = rows.filter(business_id=options['business'])
        total = sum(scan_incomplete(policy.business) for policy in rows.iterator(chunk_size=100))
        self.stdout.write(f'Notifications created: {total}')
