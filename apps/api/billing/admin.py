"""Internal operator area uses staff + explicit model permissions, never business OWNER."""
from django.contrib import admin
from rest_framework.exceptions import APIException
from .models import BillingAudit, PaymentOrder, Plan, PlanVersion, Price, ProviderEvent, Subscription, SubscriptionChange


class OperatorAdmin(admin.ModelAdmin):
    def has_module_permission(self, request):
        return request.user.is_active and request.user.is_staff and request.user.has_perm('billing.operate_billing') and super().has_module_permission(request)

    def has_view_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_staff and request.user.has_perm('billing.operate_billing') and super().has_view_permission(request, obj)

    def has_change_permission(self, request, obj=None):
        return self.has_view_permission(request, obj) and super().has_change_permission(request, obj)

    def has_add_permission(self, request):
        return request.user.is_active and request.user.is_staff and request.user.has_perm('billing.operate_billing') and super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        BillingAudit.objects.create(actor=request.user, action='CATALOG_UPDATED' if change else 'CATALOG_CREATED',
            resource_id=obj.pk, metadata={'model': obj._meta.model_name})


@admin.register(Plan)
class PlanAdmin(OperatorAdmin):
    list_display = ['code', 'name', 'published']


@admin.register(PlanVersion)
class VersionAdmin(OperatorAdmin):
    list_display = ['plan', 'number', 'effective_at', 'trial_days']

    def get_readonly_fields(self, request, obj=None):
        return ['plan', 'number', 'features', 'limits', 'effective_at', 'trial_days'] if obj else []


@admin.register(Price)
class PriceAdmin(OperatorAdmin):
    list_display = ['version', 'amount', 'currency', 'interval', 'published']

    def get_readonly_fields(self, request, obj=None):
        return ['version', 'amount', 'currency', 'interval', 'effective_at'] if obj else []


class ReadOnlyOperator(OperatorAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields]


@admin.register(Subscription)
class SubscriptionAdmin(ReadOnlyOperator):
    list_display = ['business', 'state', 'legacy_access', 'period_end']
    list_filter = ['state', 'legacy_access']
    actions = ['suspend_subscription', 'resume_subscription']

    @admin.action(description='Suspender nuevas operaciones (conservar lectura e historial)', permissions=['view'])
    def suspend_subscription(self, request, queryset):
        from .services import operator_state
        for sub in queryset:
            try:
                operator_state(request.user, sub.business_id, suspend=True)
            except APIException as exc:
                self.message_user(request, str(exc.detail), level='ERROR')

    @admin.action(description='Retirar suspensión con período confirmado vigente', permissions=['view'])
    def resume_subscription(self, request, queryset):
        from .services import operator_state
        for sub in queryset:
            try:
                operator_state(request.user, sub.business_id, suspend=False)
            except APIException as exc:
                self.message_user(request, str(exc.detail), level='ERROR')


for model in [PaymentOrder, ProviderEvent, SubscriptionChange, BillingAudit]:
    admin.site.register(model, ReadOnlyOperator)
