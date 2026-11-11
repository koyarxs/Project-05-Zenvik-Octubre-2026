from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone as dt_timezone
from uuid import uuid4
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError as ModelValidationError
from django.db import DatabaseError, close_old_connections, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import PermissionDenied, ValidationError

from businesses.models import Business, Employee, Membership
from businesses.services import write_employee
from .access import rights
from .models import BillingAudit, PaymentOrder, Plan, PlanVersion, Price, ProviderEvent, Subscription
from .providers import FlowSandbox, ProviderUnavailable, VerifiedPayment
from .services import change_subscription, confirm_payment, get_subscription, order_payment, period_end, start_checkout


class BillingFixture:
    def setup_billing(self):
        U = get_user_model()
        self.owner = U.objects.create_user(username='billing-owner', email='billing@example.test', password='Billing-test!9274')
        self.admin = U.objects.create_user(username='billing-admin', email='admin-billing@example.test')
        self.worker = U.objects.create_user(username='billing-worker', email='worker-billing@example.test')
        self.business = Business.objects.create(name='Negocio de facturación sintético')
        for user, role in [(self.owner, 'OWNER'), (self.admin, 'ADMIN'), (self.worker, 'EMPLOYEE')]:
            Membership.objects.create(user=user, business=self.business, role=role)
        self.plan = Plan.objects.create(code='test-commercial', name='Plan sintético de prueba', published=True)
        self.version = PlanVersion.objects.create(plan=self.plan, number=1,
            features=['employees', 'shifts', 'leaves', 'worker_portal'], limits={'active_employees': 1, 'administrators': 2})
        self.price = Price.objects.create(version=self.version, amount=1000, interval='MONTH', published=True)
        self.sub = Subscription.objects.create(business=self.business)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = f'/api/v1/businesses/{self.business.pk}/billing/'

    def make_order(self, key=None):
        gateway = Mock()
        gateway.name = 'test_provider'
        with patch('billing.services.provider', return_value=gateway):
            return order_payment(self.owner, self.business.pk, self.price.pk, key or uuid4(), self.sub.revision)

    def result(self, order, **overrides):
        values = dict(order_id=str(order.pk), reference=f'test-{order.pk}', event_key=f'test-{order.pk}:paid', amount=order.amount, currency=order.currency, status='PAID')
        return VerifiedPayment(**{**values, **overrides})

    def activate(self):
        order = self.make_order()
        confirm_payment(self.result(order), 'test_provider')
        self.sub.refresh_from_db()
        return order


class BillingTests(BillingFixture, TestCase):
    def setUp(self):
        self.setup_billing()

    def test_catalog_is_public_and_hides_unpublished_future_prices(self):
        self.client.force_authenticate(None)
        self.price.published = False
        self.price.save()
        Price.objects.create(version=self.version, amount=2000, interval='YEAR', published=True, effective_at=timezone.now() + timedelta(days=1))
        response = self.client.get('/api/v1/billing/plans/')
        self.assertEqual(response.status_code, 200)
        plan = next(p for p in response.data['plans'] if p['code'] == self.plan.code)
        self.assertEqual(plan['prices'], [])
        self.assertFalse(response.data['checkout_enabled'])

    def test_prices_and_plan_versions_are_immutable(self):
        self.price.amount = 9
        with self.assertRaises(ModelValidationError):
            self.price.save()
        self.version.limits = {'active_employees': 0}
        with self.assertRaises(ModelValidationError):
            self.version.save()
        for model, pk, values in [(Price, self.price.pk, {'amount': 9}), (PlanVersion, self.version.pk, {'limits': {}})]:
            with self.assertRaises(DatabaseError), transaction.atomic():
                model.objects.filter(pk=pk).update(**values)

    def test_invalid_features_and_limits(self):
        for features, limits in [(['made_up'], {}), ([], {'active_employees': -1}), ([], {'active_employees': True}), ([], {'made_up': 1})]:
            with self.assertRaises(ModelValidationError):
                PlanVersion.objects.create(plan=self.plan, number=2, features=features, limits=limits)

    def test_existing_access_is_preserved_without_paid_activation(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['legacy_access'])
        self.assertEqual(response.data['state'], 'PENDING')
        self.assertEqual(response.data['limits'], {})

    def test_only_owner_can_manage_and_read_payments(self):
        for user in [self.admin, self.worker]:
            self.client.force_authenticate(user)
            for suffix in ['', 'payments/']:
                self.assertEqual(self.client.get(self.url + suffix).status_code, 403)
            self.assertEqual(self.client.post(self.url + 'changes/', {}, format='json').status_code, 403)

    def test_foreign_business_is_uniform_404(self):
        other = Business.objects.create(name='Negocio ajeno')
        self.assertEqual(self.client.get(f'/api/v1/businesses/{other.pk}/billing/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/businesses/{uuid4()}/billing/').status_code, 404)

    def test_price_tampering_rejected(self):
        response = self.client.post(self.url + 'checkout/', {'price_id': str(self.price.pk), 'request_id': str(uuid4()), 'expected_revision': 0, 'amount': 1}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(PaymentOrder.objects.count(), 0)

    def test_disabled_checkout_creates_no_order(self):
        response = self.client.post(self.url + 'checkout/', {'price_id': str(self.price.pk), 'request_id': str(uuid4()), 'expected_revision': 0}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(PaymentOrder.objects.exists())

    def test_order_idempotency_and_conflicting_content(self):
        key = uuid4()
        order = self.make_order(key)
        self.assertEqual(order.pk, self.make_order(key).pk)
        with patch('billing.services.provider'), self.assertRaises(Exception) as context:
            order_payment(self.owner, self.business.pk, uuid4(), key, 0)
        self.assertEqual(context.exception.status_code, 409)
        self.assertEqual(PaymentOrder.objects.count(), 1)

    def test_new_request_id_cannot_create_second_initial_pending_checkout(self):
        self.make_order()
        with self.assertRaises(Exception) as ctx:
            self.make_order()
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(PaymentOrder.objects.count(), 1)

    def test_only_verified_payment_activates(self):
        order = self.make_order()
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.state, 'PENDING')
        with self.assertRaises(ValidationError):
            confirm_payment({'status': 'PAID'}, 'test_provider')
        confirm_payment(self.result(order), 'test_provider')
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.state, 'ACTIVE')
        self.assertFalse(self.sub.legacy_access)

    def test_bad_amount_currency_and_reference_do_not_activate(self):
        order = self.make_order()
        for changes in [{'amount': 1}, {'currency': 'USD'}, {'reference': ''}]:
            with self.assertRaises(ValidationError):
                confirm_payment(self.result(order, **changes), 'test_provider')
        self.assertEqual(ProviderEvent.objects.count(), 0)
        self.sub.refresh_from_db()
        self.assertTrue(self.sub.legacy_access)

    def test_duplicate_and_out_of_order_events_do_not_regress_payment(self):
        order = self.activate()
        revision = self.sub.revision
        confirm_payment(self.result(order), 'test_provider')
        confirm_payment(self.result(order, status='PENDING', event_key='late-pending'), 'test_provider')
        self.sub.refresh_from_db(); order.refresh_from_db()
        self.assertEqual(self.sub.revision, revision)
        self.assertEqual(order.state, 'PAID')

    def test_provider_event_cannot_be_reassigned(self):
        order = self.activate()
        other = self.make_order()
        with self.assertRaises(Exception) as ctx:
            confirm_payment(self.result(other, event_key=self.result(order).event_key), 'test_provider')
        self.assertEqual(ctx.exception.status_code, 409)

    def test_trial_must_be_enabled_and_is_single_use(self):
        version = PlanVersion.objects.create(plan=self.plan, number=2, features=['employees'], limits={}, trial_days=3)
        sub = change_subscription(self.owner, self.business.pk, 'TRIAL', uuid4(), 0, version_id=version.pk)
        self.assertEqual(sub.state, 'TRIALING')
        with self.assertRaises(Exception):
            change_subscription(self.owner, self.business.pk, 'TRIAL', uuid4(), sub.revision, version_id=version.pk)

    def test_capacity_applies_to_create_and_reactivation(self):
        dormant = Employee.objects.create(business=self.business, first_name='Inactiva', last_name='Test', is_active=False)
        self.activate()
        Employee.objects.create(business=self.business, first_name='Primera', last_name='Test')
        with self.assertRaises(PermissionDenied):
            write_employee(self.owner, self.business.pk, {'first_name': 'Segunda', 'last_name': 'Test'})
        with self.assertRaises(PermissionDenied):
            write_employee(self.owner, self.business.pk, {'is_active': True}, dormant.pk)

    def test_administrator_limit_preserves_roles(self):
        self.activate()
        member = Membership.objects.get(user=self.worker, business=self.business)
        member.role = 'ADMIN'
        with self.assertRaises(PermissionDenied):
            member.save()
        member.refresh_from_db()
        self.assertEqual(member.role, 'EMPLOYEE')

    def test_feature_guard_blocks_direct_api_but_not_read_history(self):
        self.activate()
        response = self.client.post(f'/api/v1/businesses/{self.business.pk}/attendance/events/', {}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get(f'/api/v1/businesses/{self.business.pk}/attendance/history/').status_code, 200)

    def test_suspension_preserves_read_access_and_existing_records(self):
        Employee.objects.create(business=self.business, first_name='Anterior', last_name='Test')
        self.activate()
        self.sub.state = 'SUSPENDED'; self.sub.save()
        self.assertEqual(self.client.get(f'/api/v1/businesses/{self.business.pk}/employees/').status_code, 200)
        self.assertEqual(self.client.post(f'/api/v1/businesses/{self.business.pk}/employees/', {'first_name': 'Nuevo', 'last_name': 'Test'}, format='json').status_code, 403)
        self.assertEqual(Employee.objects.filter(business=self.business).count(), 1)

    def test_cancel_reactivate_and_expire(self):
        self.activate()
        sub = change_subscription(self.owner, self.business.pk, 'CANCEL', uuid4(), self.sub.revision)
        self.assertTrue(sub.cancel_at_period_end)
        sub = change_subscription(self.owner, self.business.pk, 'REACTIVATE', uuid4(), sub.revision)
        self.assertFalse(sub.cancel_at_period_end)
        with patch('billing.services.timezone.now', return_value=sub.period_end + timedelta(seconds=1)):
            self.assertEqual(get_subscription(self.business.pk).state, 'EXPIRED')

    def test_cancellation_effective_preserves_history(self):
        self.activate()
        sub = change_subscription(self.owner, self.business.pk, 'CANCEL', uuid4(), self.sub.revision)
        with patch('billing.services.timezone.now', return_value=sub.period_end + timedelta(seconds=1)):
            self.assertEqual(get_subscription(self.business.pk).state, 'CANCELLED')
        self.assertEqual(PaymentOrder.objects.count(), 1)

    def test_future_renewal_is_not_applied_early(self):
        self.activate()
        before_end = self.sub.period_end
        order = self.make_order()
        confirm_payment(self.result(order), 'test_provider')
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.period_end, before_end)
        with patch('billing.services.timezone.now', return_value=before_end + timedelta(seconds=1)):
            renewed = get_subscription(self.business.pk)
        self.assertEqual(renewed.state, 'ACTIVE')
        self.assertGreater(renewed.period_end, before_end)

    def test_plan_change_is_request_only_without_data_deletion(self):
        self.activate()
        person = Employee.objects.create(business=self.business, first_name='Conservada', last_name='Test')
        sub = change_subscription(self.owner, self.business.pk, 'CHANGE', uuid4(), self.sub.revision, price_id=self.price.pk)
        self.assertEqual(sub.price_id, self.price.pk)
        self.assertTrue(Employee.objects.filter(pk=person.pk).exists())
        self.assertFalse(sub.changes.get().applied)

    def test_failed_renewal_does_not_remove_paid_period(self):
        self.activate()
        order = self.make_order()
        confirm_payment(self.result(order, status='FAILED'), 'test_provider')
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.state, 'PAST_DUE')
        self.assertTrue(rights(self.business)['writable'])

    def test_stale_confirmation_is_recorded_for_review_without_activation(self):
        order = self.make_order()
        self.sub.revision += 1; self.sub.save()
        confirm_payment(self.result(order), 'test_provider')
        self.sub.refresh_from_db(); order.refresh_from_db()
        self.assertTrue(self.sub.legacy_access)
        self.assertEqual(order.state, 'PAID')
        self.assertTrue(BillingAudit.objects.filter(action='PAYMENT_REVIEW_REQUIRED').exists())

    def test_ambiguous_checkout_is_never_automatically_repeated(self):
        gateway = Mock(); gateway.name = 'test_provider'; gateway.checkout.side_effect = ProviderUnavailable()
        data = {'price_id': self.price.pk, 'request_id': uuid4(), 'expected_revision': 0}
        with patch('billing.services.provider', return_value=gateway):
            with self.assertRaises(ProviderUnavailable):
                start_checkout(self.owner, self.business.pk, data)
            with self.assertRaises(Exception) as ctx:
                start_checkout(self.owner, self.business.pk, data)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(gateway.checkout.call_count, 1)

    def test_webhook_cannot_trust_browser_success_or_forged_token(self):
        self.client.force_authenticate(None)
        url = '/api/v1/billing/flow/callback/'
        self.assertEqual(self.client.post(url, {'status': 'PAID', 'amount': 1000}, format='json').status_code, 400)
        gateway = Mock(); gateway.verify.side_effect = ProviderUnavailable()
        with patch('billing.views.provider', return_value=gateway):
            self.assertEqual(self.client.post(url, {'token': 'forged'}, format='json').status_code, 503)
        self.assertFalse(ProviderEvent.objects.exists())

    def test_verified_callback_and_replay(self):
        order = self.make_order()
        gateway = Mock(); gateway.name = 'test_provider'; gateway.verify.return_value = self.result(order)
        with patch('billing.views.provider', return_value=gateway):
            for _ in range(2):
                self.assertEqual(self.client.post('/api/v1/billing/flow/callback/', 'token=synthetic-token', content_type='application/x-www-form-urlencoded').status_code, 200)
        self.assertEqual(ProviderEvent.objects.count(), 1)

    def test_internal_area_requires_operator_permission(self):
        self.owner.is_staff = True; self.owner.save()
        client = self.client_class(); client.force_login(self.owner)
        self.assertEqual(client.get('/admin/billing/subscription/').status_code, 403)
        self.owner.user_permissions.add(Permission.objects.get(codename='operate_billing'), Permission.objects.get(codename='view_subscription'))
        self.assertEqual(client.get('/admin/billing/subscription/').status_code, 200)

    def test_csrf_required_for_checkout(self):
        client = APIClient(enforce_csrf_checks=True); client.force_login(self.owner)
        self.assertEqual(client.post(self.url + 'checkout/', {}, format='json').status_code, 403)

    def test_payment_history_does_not_expose_other_business_orders(self):
        self.make_order()
        other = Business.objects.create(name='Segundo negocio')
        Membership.objects.create(user=self.owner, business=other, role='OWNER')
        response = self.client.get(f'/api/v1/businesses/{other.pk}/billing/payments/')
        self.assertEqual(response.data['count'], 0)

    def test_audit_event_and_order_snapshots_protected_in_sql(self):
        order = self.activate()
        for model, values in [(BillingAudit, {'action': 'tampered'}), (ProviderEvent, {'status': 'FAILED'}), (PaymentOrder, {'amount': 1}), (PaymentOrder, {'state': 'FAILED'})]:
            with self.assertRaises(DatabaseError), transaction.atomic():
                model.objects.all().update(**values)

    def test_calendar_billing_uses_calendar_months(self):
        start = datetime(2028, 1, 31, 12, tzinfo=dt_timezone.utc)
        self.assertEqual(period_end(start, 'MONTH').day, 29)
        self.assertEqual(period_end(start.replace(month=2, day=29), 'YEAR').day, 28)

    def test_business_registration_is_idempotent(self):
        from businesses.services import create_business
        key = uuid4()
        data = {'name': 'Alta idempotente sintética', 'rut': '', 'request_id': key}
        first = create_business(self.owner, data)
        self.assertEqual(create_business(self.owner, data).pk, first.pk)
        with self.assertRaises(ValidationError):
            create_business(self.owner, {**data, 'name': 'Otra identidad'})
        self.assertTrue(Subscription.objects.get(business=first).legacy_access)

    def test_inconsistent_subscription_rejected_in_orm_and_sql(self):
        self.sub.state = 'ACTIVE'
        with self.assertRaises(ModelValidationError):
            self.sub.save()
        with self.assertRaises(DatabaseError), transaction.atomic():
            Subscription.objects.filter(pk=self.sub.pk).update(state='ACTIVE')

    def test_operator_cannot_bypass_verified_payment(self):
        from .services import operator_state
        with self.assertRaises(PermissionDenied):
            operator_state(self.owner, self.business.pk, True)
        self.activate()
        operator = get_user_model().objects.create_superuser(username='billing-operator', email='operator@example.test', password='Operator-test!9274')
        self.assertEqual(operator_state(operator, self.business.pk, True).state, 'SUSPENDED')
        self.assertEqual(operator_state(operator, self.business.pk, False).state, 'ACTIVE')

    def test_downgrade_keeps_over_limit_records(self):
        Employee.objects.create(business=self.business, first_name='Anterior 1', last_name='Test')
        Employee.objects.create(business=self.business, first_name='Anterior 2', last_name='Test')
        self.activate()
        self.assertEqual(Employee.objects.filter(business=self.business).count(), 2)
        self.assertEqual(self.client.get(self.url).data['usage']['active_employees'], 2)
        with self.assertRaises(PermissionDenied):
            write_employee(self.owner, self.business.pk, {'first_name': 'Adicional', 'last_name': 'Test'})

    def test_reports_require_entitlement_but_recovery_export_remains_available(self):
        self.activate()
        base = f'/api/v1/businesses/{self.business.pk}/attendance/supervision/'
        self.assertEqual(self.client.get(base + 'reports/').status_code, 403)
        self.assertEqual(self.client.get(base + 'export/').status_code, 200)

    def test_location_quota_is_checked_before_policy_changes(self):
        from attendance.services import configure_policy
        version = PlanVersion.objects.create(plan=self.plan, number=2, features=['attendance', 'geofences'], limits={'active_sites': 1})
        self.price = Price.objects.create(version=version, amount=2000, interval='MONTH', published=True)
        self.activate()
        sites = [{'name': f'Zona sintética {i}', 'latitude': -33.45, 'longitude': -70.66, 'radius_meters': 100, 'is_active': True} for i in range(2)]
        with self.assertRaises(PermissionDenied):
            configure_policy(self.owner, self.business.pk, {'expected_version': 0, 'location_required': False, 'max_accuracy_meters': 100, 'retention_days': None, 'sites': sites})
        from attendance.models import AttendanceSite, AttendancePolicy
        self.assertFalse(AttendanceSite.objects.filter(business=self.business).exists())
        self.assertFalse(AttendancePolicy.objects.filter(business=self.business).exists())

    @override_settings(FLOW_SANDBOX_API_KEY='test-key', FLOW_SANDBOX_SECRET_KEY='test-secret')
    def test_flow_status_contract_and_signature(self):
        flow = FlowSandbox()
        expected = __import__('hmac').new(b'test-secret', b'apiKeytest-keytokenabc', 'sha256').hexdigest()
        self.assertEqual(flow.signature({'token': 'abc', 'apiKey': 'test-key'}, 'test-secret'), expected)
        with patch.object(flow, 'call', return_value={'commerceOrder': 'id', 'flowOrder': 123, 'amount': '1000.00', 'currency': 'CLP', 'status': 2}):
            result = flow.verify('not-logged')
        self.assertEqual(result.amount, 1000)
        self.assertEqual(result.status, 'PAID')


class BillingConcurrencyTests(BillingFixture, TransactionTestCase):
    def setUp(self):
        self.setup_billing()

    def test_concurrent_employee_creations_respect_capacity(self):
        self.activate()
        def create(index):
            close_old_connections()
            try:
                write_employee(self.owner, self.business.pk, {'first_name': f'Sintética {index}', 'last_name': 'Test'})
                return 'created'
            except PermissionDenied:
                return 'limited'
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(create, [1, 2]))
        self.assertCountEqual(results, ['created', 'limited'])
        self.assertEqual(Employee.objects.filter(business=self.business).count(), 1)

    def test_duplicate_callback_is_serialized(self):
        order = self.make_order()
        def confirm(_):
            close_old_connections()
            try:
                return confirm_payment(self.result(order), 'test_provider').pk
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(len(set(pool.map(confirm, [1, 2]))), 1)
        self.assertEqual(ProviderEvent.objects.count(), 1)
        self.assertEqual(BillingAudit.objects.filter(action='PAYMENT_APPLIED').count(), 1)


class BillingMigrationTests(TransactionTestCase):
    def test_existing_business_and_employee_survive_commercial_migrations(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        executor = MigrationExecutor(connection)
        try:
            executor.migrate([('billing', None)])
            # Unapplying billing does not roll back newer business/profile migrations.
            # Use the state matching those tables, including their required columns.
            existing_apps = [node for node in executor.loader.graph.leaf_nodes() if node[0] != 'billing']
            old = executor.loader.project_state(existing_apps).apps
            business = old.get_model('businesses', 'Business').objects.create(name='Anterior sintético')
            person = old.get_model('businesses', 'Employee').objects.create(business_id=business.pk, first_name='Ficha', last_name='Conservada')
            before_business = old.get_model('businesses', 'Business').objects.get(pk=business.pk).__dict__.copy()
            before_person = old.get_model('businesses', 'Employee').objects.get(pk=person.pk).__dict__.copy()
            before_business.pop('_state'); before_person.pop('_state')
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
            self.assertEqual(Business.objects.filter(pk=business.pk).values().get(), before_business)
            self.assertEqual(Employee.objects.filter(pk=person.pk).values().get(), before_person)
            sub = Subscription.objects.get(business_id=business.pk)
            self.assertTrue(sub.legacy_access)
            self.assertEqual(sub.state, 'PENDING')
            self.assertFalse(Price.objects.exists())
            self.assertEqual(Plan.objects.count(), 3)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
