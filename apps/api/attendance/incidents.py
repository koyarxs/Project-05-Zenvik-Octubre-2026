"""Incident workflows: immutable evidence, transactional decisions and internal delivery."""
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from businesses.models import Business, Membership, Shift
from businesses.permissions import active_membership, MANAGER_ROLES
from .models import (AttendanceIncident, IncidentPolicy, IncidentDecision, AttendanceCorrection,
    AttendanceAudit, AttendanceNotification, AttendanceSession, AttendanceEvent)
from .services import Conflict, digest, person_for, TRANSITIONS

CATEGORIES = {
    'MISSING_CLOCK_IN': 'Olvido de inicio de turno', 'MISSING_CLOCK_OUT': 'Olvido de término de turno',
    'MISSING_BREAK_START': 'Olvido de inicio de colación', 'MISSING_BREAK_END': 'Olvido de término de colación',
    'LOCATION_ERROR': 'Error de ubicación', 'GPS_UNAVAILABLE': 'GPS no disponible',
    'OUTSIDE_GEOFENCE': 'Fuera de geocerca', 'LOW_ACCURACY': 'Precisión GPS insuficiente',
    'TECHNICAL_ERROR': 'Error técnico', 'SCHEDULE_DIFFERENCE': 'Diferencia de horario',
    'INCOMPLETE': 'Jornada incompleta', 'OTHER': 'Otra situación justificada',
}
STATES = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED']

def audit(business, actor, action, resource_type, resource_id, details=None, correlation=None):
    return AttendanceAudit.objects.create(business=business, actor=actor, action=action, resource_type=resource_type,
        resource_id=str(resource_id), details=details or {}, correlation_id=correlation or uuid.uuid4())

def policy_data(business):
    policy = IncidentPolicy.objects.filter(business=business).first()
    return {'version': policy.version if policy else 0, 'request_days': policy.request_days if policy else None,
        'admin_review_enabled': policy.admin_review_enabled if policy else True,
        'notifications_enabled': policy.notifications_enabled if policy else True,
        'exceptional_alerts': policy.exceptional_alerts if policy else False,
        'incomplete_after_minutes': policy.incomplete_after_minutes if policy else None,
        'categories': policy.categories if policy and policy.categories else CATEGORIES,
        'review_guidance': policy.review_guidance if policy else ''}

def can_review(member, policy):
    return member.role == 'OWNER' or (member.role == 'ADMIN' and policy['admin_review_enabled'])

def reviewers(business, policy):
    return Membership.objects.filter(business=business, is_active=True, access_enabled=True, user__is_active=True,
        role__in=['OWNER', 'ADMIN'] if policy['admin_review_enabled'] else ['OWNER']).values_list('user_id', flat=True)

def notify(business, recipient_id, code, key, *, manager=False, incident=None, session=None):
    return AttendanceNotification.objects.get_or_create(business=business, recipient_id=recipient_id, dedupe_key=key,
        defaults={'code': code, 'manager_only': manager, 'incident': incident, 'session': session})[1]

def notify_incident(incident, code, policy):
    if not policy['notifications_enabled']:
        return
    key = f'incident:{incident.pk}:{incident.version}'
    targets = set(reviewers(incident.business, policy)) - {incident.requester_id}
    for recipient in targets:
        notify(incident.business, recipient, code, key, manager=True, incident=incident)
    if code != 'INCIDENT_CREATED':
        notify(incident.business, incident.requester_id, code, key, incident=incident)

@transaction.atomic
def create_incident(user, business_id, data):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    active_membership(user, business_id)
    hashed = digest(data)
    old = AttendanceIncident.objects.filter(business=business, requester=user, request_id=data['request_id']).first()
    if old:
        if old.payload_hash != hashed:
            raise Conflict('La clave de solicitud ya fue utilizada con otro contenido.')
        return old, False
    person = person_for(user, business)
    if not person:
        raise ValidationError('Necesitas una ficha activa propia para registrar una incidencia.')
    policy = policy_data(business)
    if data['category'] not in policy['categories']:
        raise ValidationError('Categoría no habilitada en este negocio.')
    today = timezone.now().astimezone(ZoneInfo(business.planning_timezone)).date()
    day = data['work_date']
    if day > today or day.year < 2000:
        raise ValidationError('La fecha laboral debe estar entre el año 2000 y hoy.')
    if policy['request_days'] is not None and (today-day).days > policy['request_days']:
        raise ValidationError('La solicitud supera el plazo operativo configurado por el negocio.')
    session = get_object_or_404(AttendanceSession, pk=data['session'], business=business, employee=person, user=user) if data.get('session') else None
    event = get_object_or_404(AttendanceEvent, pk=data['event'], business=business, employee=person, actor=user) if data.get('event') else None
    shift = get_object_or_404(Shift, pk=data['shift'], business=business, employee=person) if data.get('shift') else None
    if session and session.work_date != day:
        raise ValidationError('La fecha no coincide con la jornada original.')
    if event and (not session or event.session_id != session.pk or event.event_type != data.get('event_type')):
        raise ValidationError('La marcación no corresponde a la jornada y tipo indicados.')
    if shift and shift.starts_at.astimezone(ZoneInfo(business.planning_timezone)).date() != day:
        raise ValidationError('El turno no corresponde a la fecha laboral.')
    if session and shift and session.shift_id != shift.pk:
        raise ValidationError('El turno no corresponde a la jornada.')
    if data['category'].startswith('MISSING_') and data.get('event_type') != data['category'].removeprefix('MISSING_'):
        raise ValidationError('Selecciona el tipo de marcación que falta.')
    declared = data.get('declared_at')
    if declared:
        local = declared.astimezone(ZoneInfo(business.planning_timezone)).date()
        if not data.get('event_type') or not day <= local <= day+timedelta(days=31) or declared > timezone.now():
            raise ValidationError('La hora declarada debe ser pasada, corresponder al tipo y estar dentro de la fecha laboral o los 31 días siguientes (límite técnico).')
    elif data['category'].startswith('MISSING_'):
        raise ValidationError('Declara la fecha y hora de la marcación faltante.')
    incident = AttendanceIncident.objects.create(business=business, employee=person, requester=user, session=session, event=event,
        shift=shift or (session.shift if session else None), work_date=day, category=data['category'], category_label=policy['categories'][data['category']],
        event_type=data.get('event_type', ''), declared_at=declared, reason=data['reason'], observations=data.get('observations', ''),
        request_id=data['request_id'], payload_hash=hashed, policy_snapshot=policy)
    audit(business, user, 'INCIDENT_CREATED', 'incident', incident.pk, {'state': 'PENDING', 'category': incident.category}, data['request_id'])
    notify_incident(incident, 'INCIDENT_CREATED', policy)
    return incident, True

def validate_correction(incident):
    # One operational amendment per original or missing slot. Never silently replace an approved amendment.
    approved = AttendanceCorrection.objects.filter(incident__business=incident.business)
    if incident.event_id:
        approved = approved.filter(incident__event_id=incident.event_id)
    else:
        approved = approved.filter(incident__employee=incident.employee, incident__session=incident.session,
            incident__work_date=incident.work_date, incident__event__isnull=True, incident__event_type=incident.event_type)
    if approved.exists():
        raise Conflict('Ya existe una regularización aprobada para esa marcación. Requiere revisión formal adicional.')
    if not incident.session_id:
        return  # Declaration without a captured journey never invents a session.
    original = list(incident.session.events.order_by('sequence'))
    amended = {str(c.incident.event_id): c for c in AttendanceCorrection.objects.filter(incident__session=incident.session, incident__event__isnull=False).select_related('incident')}
    timeline = [(amended[str(e.pk)].declared_at if str(e.pk) in amended else e.recorded_at, e.event_type, str(e.pk)) for e in original if e.pk != incident.event_id]
    timeline += [(c.declared_at, c.incident.event_type, str(c.pk)) for c in AttendanceCorrection.objects.filter(incident__session=incident.session, incident__event__isnull=True).select_related('incident')]
    timeline.append((incident.declared_at, incident.event_type, str(incident.pk)))
    timeline.sort(key=lambda item: (item[0], {'CLOCK_IN': 0, 'BREAK_START': 1, 'BREAK_END': 2, 'CLOCK_OUT': 3}[item[1]]))
    state = 'NOT_STARTED'
    for _, kind, _ in timeline:
        allowed = {'CLOCK_IN': 'WORKING'} if state == 'NOT_STARTED' else TRANSITIONS[state]
        if kind not in allowed:
            raise ValidationError('La declaración genera una secuencia incompatible. Rechaza o regulariza primero las marcaciones previas que faltan.')
        state = allowed[kind]

@transaction.atomic
def decide_incident(user, business_id, pk, data):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    member = active_membership(user, business_id)
    policy = policy_data(business)
    query = AttendanceIncident.objects.filter(business=business)
    if member.role not in MANAGER_ROLES:
        query = query.filter(requester=user)
    incident = get_object_or_404(query.select_related('event', 'session', 'employee', 'business'), pk=pk)
    old = IncidentDecision.objects.filter(incident=incident, actor=user, request_id=data['request_id']).first()
    if old:
        if old.payload_hash != digest(data):
            raise Conflict('La clave de decisión ya tiene otro contenido.')
        return incident, False
    target = data['state']
    if target == 'CANCELLED':
        if incident.requester_id != user.pk or incident.status != 'PENDING':
            raise PermissionDenied('Solo el solicitante puede cancelar una solicitud pendiente.')
    elif not can_review(member, policy) or incident.requester_id == user.pk or incident.employee.user_id == user.pk:
        raise PermissionDenied('No puedes decidir solicitudes propias o sin permiso de revisión.')
    if incident.version != data['expected_version']:
        raise Conflict('La solicitud cambió. Actualiza el detalle.')
    transitions = {'PENDING': ['IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'], 'IN_REVIEW': ['APPROVED', 'REJECTED']}
    if target not in transitions.get(incident.status, []):
        raise Conflict('La transición no está permitida; las decisiones finales son inmutables.')
    if target == 'APPROVED' and incident.declared_at:
        validate_correction(incident)
    before = incident.status
    incident.status = target; incident.version += 1; incident.updated_at = timezone.now()
    incident.save(update_fields=['status', 'version', 'updated_at'])
    decision = IncidentDecision.objects.create(incident=incident, actor=user, previous_state=before, state=target,
        reason=data['reason'], request_id=data['request_id'], payload_hash=digest(data), version=incident.version)
    audit(business, user, 'INCIDENT_'+target, 'incident', pk, {'before': before, 'after': target, 'decision': str(decision.pk)}, data['request_id'])
    if target == 'APPROVED' and incident.declared_at:
        correction = AttendanceCorrection.objects.create(incident=incident, actor=user, original_at=incident.event.recorded_at if incident.event_id else None,
            declared_at=incident.declared_at, reason=data['reason'])
        audit(business, user, 'OPERATIONAL_CORRECTION', 'correction', correction.pk, {'incident': str(incident.pk), 'state': correction.state}, data['request_id'])
    notify_incident(incident, 'INCIDENT_'+target, policy)
    return incident, True

@transaction.atomic
def configure(user, business_id, data):
    business = get_object_or_404(Business.objects.select_for_update(), pk=business_id)
    if active_membership(user, business_id).role != 'OWNER':
        raise PermissionDenied('Solo OWNER puede configurar los permisos y reglas de regularización.')
    before = policy_data(business)
    if before['version'] != data['expected_version']:
        raise Conflict()
    values = {key: value for key, value in data.items() if key != 'expected_version'}
    policy, _ = IncidentPolicy.objects.update_or_create(business=business, defaults={**values, 'version': before['version']+1})
    after = policy_data(business)
    audit(business, user, 'INCIDENT_POLICY_CHANGED', 'incident_policy', business.pk, {'before': before, 'after': after})
    return after

def alert_exception(event):
    policy = policy_data(event.business)
    if policy['notifications_enabled'] and policy['exceptional_alerts'] and (event.geo_result not in ['INSIDE', 'NO_GEOFENCE'] or event.exception_reason):
        for recipient in reviewers(event.business, policy):
            notify(event.business, recipient, 'EXCEPTIONAL_EVENT', f'exception:{event.pk}', manager=True, session=event.session)

def scan_incomplete(business):
    policy = policy_data(business)
    if not policy['notifications_enabled'] or policy['incomplete_after_minutes'] is None:
        return 0
    total = 0
    for pk in AttendanceSession.objects.filter(business=business).exclude(state='FINISHED').values_list('pk', flat=True).iterator(chunk_size=100):
        with transaction.atomic():
            Business.objects.select_for_update().get(pk=business.pk)
            policy = policy_data(business)
            if not policy['notifications_enabled'] or policy['incomplete_after_minutes'] is None:
                return total
            session = AttendanceSession.objects.get(pk=pk)
            end = session.shift_snapshot.get('ends_at')
            if session.state == 'FINISHED' or not end or timezone.now() <= datetime.fromisoformat(end)+timedelta(minutes=policy['incomplete_after_minutes']):
                continue
            for recipient in reviewers(business, policy):
                total += int(notify(business, recipient, 'INCOMPLETE_SESSION', f'incomplete:{pk}', manager=True, session=session))
    return total
