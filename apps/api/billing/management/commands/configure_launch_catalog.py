"""Local launch catalogue. Prices are final CLP totals, including VAT."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from billing.models import FEATURES, Plan, PlanVersion, Price


LAUNCH_PLANS = (
    ('basico', 'Básico', 'Para un negocio con un equipo pequeño.', 11900, 20, 1, 2),
    ('profesional', 'Profesional', 'Para equipos con más personas y ubicaciones.', 24900, 50, 3, 5),
    ('premium', 'Premium', 'Para coordinar una operación de mayor tamaño.', 44900, 100, 10, 10),
)


class Command(BaseCommand):
    help = 'Configura los precios de lanzamiento solo en desarrollo local. No cobra ni modifica suscripciones.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Aplicar al catálogo local. Sin esta opción solo muestra la propuesta.')

    def handle(self, *args, **options):
        if not options['apply']:
            for _, name, _, amount, employees, sites, admins in LAUNCH_PLANS:
                self.stdout.write(f'{name}: {amount} CLP/mes IVA incluido; {employees} trabajadores; {sites} ubicaciones; {admins} administradores.')
            return
        host = settings.DATABASES['default'].get('HOST', '')
        if (getattr(settings, 'PRODUCTION', False)
                or getattr(settings, 'APP_ENVIRONMENT', '') not in ('development', 'test')
                or host not in ('127.0.0.1', 'localhost', '::1')):
            raise CommandError('Este comando solo aplica al desarrollo local con base de datos local.')
        self.apply_plans()

    @transaction.atomic
    def apply_plans(self):
        for position, (code, name, description, amount, employees, sites, admins) in enumerate(LAUNCH_PLANS):
            plan, _ = Plan.objects.get_or_create(code=code, defaults={'name': name})
            plan = Plan.objects.select_for_update().get(pk=plan.pk)
            plan.name, plan.description, plan.published, plan.sort_order = name, description, True, position
            plan.save(update_fields=['name', 'description', 'published', 'sort_order'])
            limits = {'active_employees': employees, 'active_sites': sites, 'administrators': admins}
            latest = plan.versions.order_by('-number').first()
            same = (latest and latest.features == list(FEATURES) and latest.limits == limits and latest.trial_days == 0)
            version = latest if same else PlanVersion.objects.create(
                plan=plan, number=latest.number + 1 if latest else 1,
                features=list(FEATURES), limits=limits, trial_days=0)
            prices = list(version.prices.filter(published=True))
            if not (len(prices) == 1 and prices[0].amount == amount
                    and prices[0].currency == 'CLP' and prices[0].interval == 'MONTH'):
                # Old payment orders and subscriptions retain their immutable price IDs.
                version.prices.filter(published=True).update(published=False)
                Price.objects.create(version=version, amount=amount, currency='CLP', interval='MONTH', published=True)
            self.stdout.write(f'{name}: catálogo local configurado ({amount} CLP/mes).')
        self.stdout.write('No se modificaron suscripciones, pagos ni configuración de la pasarela.')
