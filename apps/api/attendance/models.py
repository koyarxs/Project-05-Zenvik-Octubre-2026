import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class AttendancePolicy(models.Model):
    business = models.OneToOneField('businesses.Business', on_delete=models.PROTECT, primary_key=True)
    location_required = models.BooleanField(default=False)
    max_accuracy_meters = models.PositiveIntegerField(default=100)
    retention_days = models.PositiveIntegerField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)


class AttendanceSite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    radius_meters = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class AttendanceSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    employee = models.ForeignKey('businesses.Employee', on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    shift = models.ForeignKey('businesses.Shift', on_delete=models.PROTECT, null=True, blank=True)
    shift_snapshot = models.JSONField(default=dict)
    work_date = models.DateField()
    timezone_name = models.CharField(max_length=64, default='America/Santiago')
    state = models.CharField(max_length=16, default='WORKING')
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['business', 'employee'], condition=~models.Q(state='FINISHED'), name='attendance_one_open_session'),
            models.CheckConstraint(condition=models.Q(state__in=['WORKING', 'ON_BREAK', 'FINISHED']), name='attendance_session_state'),
        ]
        indexes = [models.Index(fields=['business', 'user', 'work_date']), models.Index(fields=['business', 'employee', 'work_date'], name='attendance_supervision_idx'), models.Index(fields=['business', 'work_date'], name='attendance_report_date_idx')]


class ImmutableRecord(models.Model):
    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('El registro original es inmutable.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('El registro original no se puede eliminar.')


class AttendanceEvent(ImmutableRecord):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AttendanceSession, on_delete=models.PROTECT, related_name='events')
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    employee = models.ForeignKey('businesses.Employee', on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    employee_name = models.CharField(max_length=255)
    business_name = models.CharField(max_length=255)
    event_type = models.CharField(max_length=16)
    recorded_at = models.DateTimeField(default=timezone.now, editable=False)
    sequence = models.PositiveIntegerField()
    request_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    latitude = models.FloatField(null=True)
    longitude = models.FloatField(null=True)
    accuracy_meters = models.FloatField(null=True)
    location_status = models.CharField(max_length=20)
    geo_result = models.CharField(max_length=32)
    exception_reason = models.CharField(max_length=500, blank=True)
    policy_snapshot = models.JSONField(default=dict)
    previous_hash = models.CharField(max_length=64, blank=True)
    integrity_hash = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['business', 'actor', 'request_id'], name='attendance_unique_request'),
            models.UniqueConstraint(fields=['session', 'sequence'], name='attendance_event_sequence'),
            models.CheckConstraint(condition=models.Q(event_type__in=['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT']), name='attendance_event_type'),
            models.CheckConstraint(condition=(models.Q(latitude__isnull=True, longitude__isnull=True, accuracy_meters__isnull=True) | models.Q(latitude__isnull=False, longitude__isnull=False, accuracy_meters__isnull=False, latitude__gte=-90, latitude__lte=90, longitude__gte=-180, longitude__lte=180, accuracy_meters__gte=0, accuracy_meters__lte=100000)), name='attendance_valid_location'),
        ]
        indexes = [models.Index(fields=['business', 'actor', 'recorded_at'])]


class AttendancePolicyRevision(ImmutableRecord):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(default=timezone.now, editable=False)
    snapshot = models.JSONField()


class AttendanceReview(ImmutableRecord):
    session = models.ForeignKey(AttendanceSession, on_delete=models.PROTECT, related_name='reviews')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(default=timezone.now, editable=False)
    previous_state = models.CharField(max_length=16)
    state = models.CharField(max_length=16)
    reason = models.CharField(max_length=1000)

    class Meta:
        ordering = ['-id']
        constraints = [models.CheckConstraint(condition=models.Q(state__in=['PENDING', 'REVIEWING', 'RESOLVED']), name='attendance_review_state')]


class AttendanceRejection(ImmutableRecord):
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    employee = models.ForeignKey('businesses.Employee', on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(default=timezone.now, editable=False)
    event_type = models.CharField(max_length=16)
    code = models.CharField(max_length=32)

    class Meta:
        indexes = [models.Index(fields=['business', 'employee', 'recorded_at'], name='attendance_rejection_idx')]

# Stage 14: requests and operational amendments are separate from captured events.
class IncidentPolicy(models.Model):
    business = models.OneToOneField('businesses.Business', on_delete=models.PROTECT, primary_key=True)
    version = models.PositiveIntegerField(default=1)
    request_days = models.PositiveIntegerField(null=True, blank=True)
    admin_review_enabled = models.BooleanField(default=True)
    notifications_enabled = models.BooleanField(default=True)
    exceptional_alerts = models.BooleanField(default=False)
    incomplete_after_minutes = models.PositiveIntegerField(null=True, blank=True)
    categories = models.JSONField(default=dict)
    review_guidance = models.CharField(max_length=1000, blank=True)


class AttendanceIncident(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    employee = models.ForeignKey('businesses.Employee', on_delete=models.PROTECT)
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    session = models.ForeignKey(AttendanceSession, on_delete=models.PROTECT, null=True, related_name='incidents')
    event = models.ForeignKey(AttendanceEvent, on_delete=models.PROTECT, null=True)
    shift = models.ForeignKey('businesses.Shift', on_delete=models.PROTECT, null=True)
    work_date = models.DateField()
    category = models.CharField(max_length=48)
    category_label = models.CharField(max_length=100)
    event_type = models.CharField(max_length=16, blank=True)
    declared_at = models.DateTimeField(null=True)
    reason = models.CharField(max_length=1500)
    observations = models.CharField(max_length=1500, blank=True)
    status = models.CharField(max_length=16, default='PENDING')
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)
    request_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    policy_snapshot = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['business', 'requester', 'request_id'], name='incident_create_idempotent'),
            models.CheckConstraint(condition=models.Q(status__in=['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED']), name='incident_status_valid'),
        ]
        indexes = [models.Index(fields=['business', 'status', 'work_date'], name='incident_business_status_idx'), models.Index(fields=['business', 'requester', 'created_at'], name='incident_requester_idx')]


class IncidentDecision(ImmutableRecord):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(AttendanceIncident, on_delete=models.PROTECT, related_name='decisions')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(default=timezone.now, editable=False)
    previous_state = models.CharField(max_length=16)
    state = models.CharField(max_length=16)
    reason = models.CharField(max_length=1500)
    request_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    version = models.PositiveIntegerField()

    class Meta:
        ordering = ['version']
        constraints = [models.UniqueConstraint(fields=['incident', 'version'], name='incident_decision_version'), models.UniqueConstraint(fields=['incident', 'actor', 'request_id'], name='incident_decision_idempotent')]


class AttendanceCorrection(ImmutableRecord):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.OneToOneField(AttendanceIncident, on_delete=models.PROTECT, related_name='correction')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    original_at = models.DateTimeField(null=True)
    declared_at = models.DateTimeField()
    approved_at = models.DateTimeField(default=timezone.now, editable=False)
    applied_at = models.DateTimeField(default=timezone.now, editable=False)
    reason = models.CharField(max_length=1500)
    state = models.CharField(max_length=24, default='OPERATIONAL_ONLY')


class AttendanceAudit(ImmutableRecord):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    recorded_at = models.DateTimeField(default=timezone.now, editable=False)
    action = models.CharField(max_length=48)
    resource_type = models.CharField(max_length=32)
    resource_id = models.CharField(max_length=64)
    correlation_id = models.UUIDField(default=uuid.uuid4)
    details = models.JSONField(default=dict)

    class Meta:
        indexes = [models.Index(fields=['business', 'recorded_at'], name='attendance_audit_date_idx')]


class AttendanceNotification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    business = models.ForeignKey('businesses.Business', on_delete=models.PROTECT)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    incident = models.ForeignKey(AttendanceIncident, on_delete=models.PROTECT, null=True)
    session = models.ForeignKey(AttendanceSession, on_delete=models.PROTECT, null=True)
    code = models.CharField(max_length=48)
    dedupe_key = models.CharField(max_length=160)
    manager_only = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    read_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['business', 'recipient', 'dedupe_key'], name='notification_idempotent')]
        indexes = [models.Index(fields=['business', 'recipient', 'read_at'], name='notification_inbox_idx')]
