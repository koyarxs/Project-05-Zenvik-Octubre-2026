from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import AuthRateLimit


class Command(BaseCommand):
    help = 'Remove expired authentication rate-limit buckets in bounded batches.'

    def handle(self, *args, **options):
        total = 0
        while True:
            with transaction.atomic():
                keys = list(AuthRateLimit.objects.select_for_update(skip_locked=True).filter(
                    expires_at__lte=timezone.now(),
                ).order_by('key').values_list('key', flat=True)[:500])
                if not keys:
                    break
                count, _ = AuthRateLimit.objects.filter(pk__in=keys).delete()
                total += count
        self.stdout.write(f'Expired authentication buckets removed: {total}')
