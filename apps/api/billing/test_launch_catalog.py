from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from .models import FEATURES, Plan, PlanVersion, Price


@override_settings(PRODUCTION=False, APP_ENVIRONMENT='development')
class LaunchCatalogTests(TestCase):
    def run_command(self, **options):
        call_command('configure_launch_catalog', stdout=StringIO(), **options)

    def test_dry_run_does_not_write(self):
        before = (Plan.objects.count(), PlanVersion.objects.count(), Price.objects.count())
        self.run_command()
        self.assertEqual((Plan.objects.count(), PlanVersion.objects.count(), Price.objects.count()), before)

    def test_catalogue_is_idempotent_and_preserves_old_price(self):
        plan, _ = Plan.objects.get_or_create(code='basico', defaults={'name': 'Anterior'})
        old = plan.versions.order_by('-number').first()
        if old is None:
            old = PlanVersion.objects.create(plan=plan, number=1, features=['employees'], limits={})
        price = Price.objects.create(version=old, amount=1000, published=True, interval='MONTH')
        versions_before = PlanVersion.objects.count()
        self.run_command(apply=True)
        self.run_command(apply=True)
        self.assertEqual(Plan.objects.count(), 3)
        self.assertEqual(PlanVersion.objects.count(), versions_before + 3)
        self.assertEqual(Price.objects.count(), 4)
        current = plan.versions.get(number=old.number + 1)
        self.assertEqual(current.features, list(FEATURES))
        self.assertEqual(current.limits['active_employees'], 20)
        self.assertEqual(current.prices.get(published=True).amount, 11900)
        price.refresh_from_db()
        self.assertEqual(price.amount, 1000)
        self.assertEqual(price.version_id, old.pk)

    @override_settings(PRODUCTION=True)
    def test_does_not_apply_in_production(self):
        before = Plan.objects.count()
        with self.assertRaises(CommandError):
            self.run_command(apply=True)
        self.assertEqual(Plan.objects.count(), before)
