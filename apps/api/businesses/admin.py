from django.contrib import admin

from .models import Business, Employee, Membership


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ('name', 'rut', 'is_active', 'created_at', 'updated_at')
    search_fields = ('name', 'rut')
    list_filter = ('is_active',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'business', 'role', 'is_active', 'created_at')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'business__name')
    list_filter = ('is_active', 'role', 'business')
    autocomplete_fields = ('user', 'business')
    list_select_related = ('user', 'business')
    readonly_fields = ('created_at',)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'business', 'user', 'hire_date', 'is_active')
    search_fields = ('first_name', 'last_name', 'business__name')
    list_filter = ('is_active', 'business')
    autocomplete_fields = ('user', 'business')
    list_select_related = ('user', 'business')
    readonly_fields = ('created_at', 'updated_at')
