import hashlib
import json
import math
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from businesses.models import Business, Employee, Shift
from businesses.permissions import MANAGER_ROLES, active_membership
from .models import AttendanceEvent, AttendancePolicy, AttendancePolicyRevision, AttendanceSession, AttendanceSite


class Conflict(APIException):
    status_code = 409
    default_detail = 'El estado cambió. Actualiza antes de volver a marcar.'


TRANSITIONS = {'WORKING': {'BREAK_START': 'ON_BREAK', 'CLOCK_OUT': 'FINISHED'}, 'ON_BREAK': {'BREAK_END': 'WORKING'}, 'FINISHED': {}}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def policy_data(business):
    policy = AttendancePolicy.objects.filter(business=business).first()
    return {'version': policy.version if policy else 0, 'location_required': policy.location_required if policy else False,
            'max_accuracy_meters': policy.max_accuracy_meters if policy else 100, 'retention_days': policy.retention_days if policy else None,
            'sites': list(AttendanceSite.objects.filter(business=business).order_by('created_at', 'id').values('id', 'name', 'latitude', 'longitude', 'radius_meters', 'is_active'))}


def person_for(user, business, active=True):
    query = Employee.objects.filter(user=user, business=business)
    if active:
        query = query.filter(is_active=True)
    return query.first()


def planned_shift(person, business, now):
    if not person:
        return None
    zone = ZoneInfo(business.planning_timezone)
    tomorrow = datetime.combine(now.astimezone(zone).date() + timedelta(days=1), time.min, tzinfo=zone)
    return Shift.objects.filter(business=business, employee=person, status='SCHEDULED', ends_at__gt=now, starts_at__lt=tomorrow).order_by('starts_at', 'id').first()


def shift_data(shift):
    return {'id': str(shift.pk), 'starts_at': shift.starts_at.isoformat(), 'ends_at': shift.ends_at.isoformat()} if shift else {}


def distance_meters(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    term = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, max(0, term))))


def geographic_result(location, policy):
    if location is None:
        return 'MISSING_LOCATION'
    if location['accuracy_meters'] > policy['max_accuracy_meters']:
        return 'LOW_ACCURACY'
    sites = [site for site in policy['sites'] if site['is_active']]
    if not sites:
        return 'NO_GEOFENCE'
    distances = [(distance_meters(location['latitude'], location['longitude'], site['latitude'], site['longitude']), site['radius_meters']) for site in sites]
    if any(distance + location['accuracy_meters'] <= radius for distance, radius in distances):
        return 'INSIDE'
    if any(distance - location['accuracy_meters'] <= radius for distance, radius in distances):
        return 'UNCERTAIN_BOUNDARY'
    return 'OUTSIDE'


@transaction.atomic
def record_event(user, business_id, data):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    active_membership(user, business_id)
    from billing.access import require_feature
    require_feature(business, 'attendance')
    payload_hash = digest(data)
    previous = AttendanceEvent.objects.filter(business=business, actor=user, request_id=data['request_id']).first()
    if previous:
        if previous.payload_hash != payload_hash:
            raise Conflict('Esta clave ya fue utilizada para otra solicitud.')
        return previous, False
    person = person_for(user, business)
    if not person:
        raise ValidationError('Necesitas una ficha activa vinculada a tu cuenta para marcar.')
    policy = policy_data(business)
    location = data['location']
    if location is not None:
        require_feature(business, 'geolocation')
    geo = geographic_result(location, policy)
    if policy['location_required'] and location is None and len(data['exception_reason'].strip()) < 10:
        raise ValidationError('Se requiere ubicación. Si no está disponible, registra una excepción explicando la incidencia (mínimo 10 caracteres).')
    now = timezone.now()  # Official instant, obtained after locking; never supplied by the client.
    event_type = data['event_type']
    if data['session_id'] is None:
        if event_type != 'CLOCK_IN' or data['expected_version'] != 0:
            raise Conflict('Primero debes iniciar una jornada.')
        if AttendanceSession.objects.filter(business=business, employee=person).exclude(state='FINISHED').exists():
            raise Conflict('Ya existe una jornada abierta. Actualiza el estado.')
        shift = planned_shift(person, business, now)
        session = AttendanceSession.objects.create(business=business, employee=person, user=user, shift=shift, shift_snapshot=shift_data(shift),
            work_date=(shift.starts_at if shift else now).astimezone(ZoneInfo(business.planning_timezone)).date(), timezone_name=business.planning_timezone, created_at=now, updated_at=now)
    else:
        session = get_object_or_404(AttendanceSession.objects.select_for_update(), pk=data['session_id'], business=business, employee=person, user=user)
        if session.version != data['expected_version'] or event_type not in TRANSITIONS[session.state]:
            raise Conflict('Esta marcación no corresponde al estado actual de la jornada.')
        session.state = TRANSITIONS[session.state][event_type]
        session.version += 1
        session.updated_at = now
        session.save(update_fields=['state', 'version', 'updated_at'])
    last = AttendanceEvent.objects.filter(session=session).order_by('-sequence').first()
    values = dict(session=session, business=business, employee=person, actor=user, employee_name=str(person), business_name=business.name,
        event_type=event_type, recorded_at=now, sequence=session.version, request_id=data['request_id'], payload_hash=payload_hash,
        latitude=location['latitude'] if location else None, longitude=location['longitude'] if location else None,
        accuracy_meters=location['accuracy_meters'] if location else None, location_status=data['location_status'], geo_result=geo,
        exception_reason=data['exception_reason'], policy_snapshot=json.loads(json.dumps(policy, default=str)), previous_hash=last.integrity_hash if last else '')
    identity = {key: (str(value.pk) if hasattr(value, 'pk') else value) for key, value in values.items()}
    values['integrity_hash'] = digest(identity)
    event = AttendanceEvent.objects.create(**values)
    from .incidents import alert_exception
    alert_exception(event)
    return event, True


@transaction.atomic
def configure_policy(user, business_id, data):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    member = active_membership(user, business_id)
    if member.role not in MANAGER_ROLES:
        raise PermissionDenied('Solo la administración puede configurar la política.')
    existing = AttendancePolicy.objects.filter(business=business).first()
    if data['expected_version'] != (existing.version if existing else 0):
        raise Conflict()
    sites = data['sites']
    from billing.access import check_capacity, require_feature
    require_feature(business, 'attendance')
    if any(site.get('is_active', True) for site in sites):
        require_feature(business, 'geofences')
    check_capacity(business, 'active_sites', sum(bool(site.get('is_active', True)) for site in sites))
    ids = [site['id'] for site in sites if 'id' in site]
    if len(ids) != len(set(ids)) or AttendanceSite.objects.filter(business=business, pk__in=ids).count() != len(ids):
        raise ValidationError('Hay ubicaciones no disponibles o repetidas.')
    if AttendanceSite.objects.filter(business=business).count() + sum('id' not in site for site in sites) > 20:
        raise ValidationError('El negocio admite hasta 20 ubicaciones. Reutiliza o edita una ubicación existente.')
    policy = existing or AttendancePolicy(business=business, version=0)
    for key in ['location_required', 'max_accuracy_meters', 'retention_days']:
        setattr(policy, key, data[key])
    policy.version += 1
    policy.save()
    # Deactivation preserves site identities and historical event snapshots.
    AttendanceSite.objects.filter(business=business).exclude(pk__in=ids).update(is_active=False)
    for site in sites:
        values = {key: value for key, value in site.items() if key != 'id'}
        if 'id' in site:
            item = AttendanceSite.objects.get(pk=site['id'], business=business)
            for key, value in values.items():
                setattr(item, key, value)
            item.save()
        else:
            AttendanceSite.objects.create(business=business, **values)
    result = policy_data(business)
    revision = AttendancePolicyRevision.objects.create(business=business, actor=user, snapshot=json.loads(json.dumps(result, default=str)))
    from .incidents import audit
    audit(business, user, 'ATTENDANCE_POLICY_CHANGED', 'attendance_policy', business.pk, {'version': result['version'], 'revision': str(revision.pk), 'site_ids': [str(site['id']) for site in result['sites']], 'location_required': result['location_required']})
    return result
