import uuid
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from businesses.leave_services import create_leave
from businesses.models import Business, Employee, Membership
from .incidents import create_incident
from .models import AttendanceEvent, AttendanceNotification
from .services import record_event
from .test_incidents import cleaned, request_data
from .tests import NOW, fixture, payload, validated


class PersonalAttendanceTests(TestCase):
    def setUp(self):
        self.business, self.owner, self.user, self.peer, self.employee = fixture()
        Employee.objects.create(user=self.owner, business=self.business, first_name='Owner', last_name='Personal')
        self.client = APIClient()
        self.client.force_login(self.user)
        self.base = f'/api/v1/businesses/{self.business.pk}/attendance/'

    def mark(self, user=None, **extra):
        with patch('attendance.services.timezone.now', return_value=NOW):
            return record_event(user or self.user, self.business.pk, validated(payload(**extra)))[0]

    def incident(self, user):
        with patch('attendance.incidents.timezone.now', return_value=NOW + timedelta(hours=2)):
            return create_incident(user, self.business.pk, cleaned(request_data()))[0]

    def test_submission_lookup_is_owned_and_contains_no_coordinates(self):
        event = self.mark()
        response = self.client.get(self.base + f'submissions/{event.request_id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['receipt']['id'], str(event.pk))
        self.assertEqual(response.data['receipt']['timezone_name'], 'America/Santiago')
        self.assertIn('no-store', response['Cache-Control'])
        self.assertNotIn('latitude', str(response.data))
        self.assertNotIn('longitude', str(response.data))
        self.client.force_login(self.peer)
        self.assertEqual(self.client.get(self.base + f'submissions/{event.request_id}/').status_code, 404)
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get(self.base + f'submissions/{event.request_id}/').status_code, 404)

    def test_lookup_is_not_a_write_or_a_negative_acknowledgement(self):
        response = self.client.get(self.base + f'submissions/{uuid.uuid4()}/')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(AttendanceEvent.objects.exists())

    def test_changed_location_retry_recovers_original_without_new_event(self):
        data = payload()
        first = self.client.post(self.base + 'events/', data, format='json')
        self.assertEqual(first.status_code, 201)
        changed = {**data, 'location': {**data['location'], 'accuracy_meters': 20}}
        self.assertEqual(self.client.post(self.base + 'events/', changed, format='json').status_code, 409)
        recovered = self.client.get(self.base + f"submissions/{data['request_id']}/")
        self.assertEqual(recovered.data['receipt']['id'], first.data['receipt']['id'])
        self.assertEqual(AttendanceEvent.objects.count(), 1)

    def test_personal_current_preserves_rules_without_exposing_site_coordinates(self):
        response = self.client.get(self.base + 'personal/current/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['allowed_actions'], ['CLOCK_IN'])
        self.assertEqual(set(response.data['policy']), {'version', 'location_required', 'max_accuracy_meters'})
        self.assertIn('server_now', response.data)

    def test_no_employee_inactive_employee_and_suspended_membership(self):
        self.employee.is_active = False
        self.employee.save(update_fields=['is_active'])
        response = self.client.get(self.base + 'personal/current/')
        self.assertFalse(response.data['eligible'])
        self.assertEqual(response.data['allowed_actions'], [])
        self.assertEqual(self.client.post(self.base + 'events/', payload(), format='json').status_code, 400)
        self.employee.user = None
        self.employee.save(update_fields=['user'])
        self.assertIsNone(self.client.get(self.base + 'personal/current/').data['employee_name'])
        Membership.objects.filter(user=self.user, business=self.business).update(is_active=False)
        self.assertEqual(self.client.get(self.base + 'personal/current/').status_code, 404)

    def test_other_business_or_anonymous_cannot_recover_a_receipt(self):
        event = self.mark()
        other = Business.objects.create(name='Otra empresa aislada')
        Membership.objects.create(user=self.user, business=other, role='EMPLOYEE')
        path = self.base.replace(str(self.business.pk), str(other.pk)) + f'submissions/{event.request_id}/'
        self.assertEqual(self.client.get(path).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(self.base + 'personal/current/').status_code, 403)
        self.assertEqual(self.client.get(self.base + f'submissions/{event.request_id}/').status_code, 403)

    def test_owner_personal_incidents_exclude_peers_and_cannot_review(self):
        own, peer = self.incident(self.owner), self.incident(self.peer)
        self.client.force_login(self.owner)
        root = self.base + 'personal/incidents/'
        listing = self.client.get(root)
        self.assertEqual([item['id'] for item in listing.data['results']], [str(own.pk)])
        self.assertFalse(self.client.get(root + f'{own.pk}/').data['can_review'])
        self.assertEqual(self.client.get(root + f'{peer.pk}/').status_code, 404)
        self.assertEqual(self.client.post(root + f'{peer.pk}/transition/', {'state': 'APPROVED'}, format='json').status_code, 404)
        self.assertEqual(self.client.post(root + f'{own.pk}/transition/', {'state': 'APPROVED'}, format='json').status_code, 403)
        self.assertEqual(self.client.put(root + 'policy/', {}, format='json').status_code, 405)
        # The administrative scope continues to see the same two records.
        self.assertEqual(self.client.get(self.base + 'incidents/').data['count'], 2)

    def test_owner_can_cancel_own_incident_through_personal_scope(self):
        own = self.incident(self.owner)
        self.client.force_login(self.owner)
        response = self.client.post(self.base + f'personal/incidents/{own.pk}/transition/', {
            'state': 'CANCELLED', 'request_id': str(uuid.uuid4()), 'expected_version': 1,
            'reason': 'Ya pude verificar mi registro original.',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'CANCELLED')

    def test_owner_and_admin_personal_leave_scope(self):
        own = create_leave(self.owner, self.business.pk, {'request_type': 'PERSONAL', 'start_date': NOW.date(), 'end_date': NOW.date(), 'reason': 'Propia'})
        peer = create_leave(self.peer, self.business.pk, {'request_type': 'PERSONAL', 'start_date': NOW.date(), 'end_date': NOW.date(), 'reason': 'Ajena'})
        for role in ['OWNER', 'ADMIN']:
            Membership.objects.filter(user=self.owner, business=self.business).update(role=role)
            self.client.force_login(self.owner)
            root = self.base + 'personal/leave-requests/'
            response = self.client.get(root)
            self.assertEqual([item['id'] for item in response.data['results']], [str(own.pk)])
            self.assertFalse(response.data['results'][0]['can_review'])
            self.assertEqual(self.client.get(root + f'{peer.pk}/').status_code, 404)
            self.assertEqual(self.client.post(root + f'{peer.pk}/cancel/', {}, format='json').status_code, 404)
        self.assertEqual(self.client.post(root + f'{own.pk}/cancel/', {}, format='json').status_code, 200)

    def test_personal_notification_scope_excludes_management_notifications(self):
        self.client.force_login(self.owner)
        own = AttendanceNotification.objects.create(business=self.business, recipient=self.owner, code='INCIDENT_APPROVED', dedupe_key='personal', manager_only=False)
        admin = AttendanceNotification.objects.create(business=self.business, recipient=self.owner, code='INCIDENT_CREATED', dedupe_key='admin', manager_only=True)
        AttendanceNotification.objects.create(business=self.business, recipient=self.peer, code='INCIDENT_APPROVED', dedupe_key='peer', manager_only=False)
        root = self.base + 'personal/notifications/'
        result = self.client.get(root)
        self.assertEqual(result.data['count'], 1)
        self.assertEqual(result.data['unread_count'], 1)
        self.assertEqual(self.client.post(root + f'{admin.pk}/read/', {}, format='json').status_code, 404)
        self.assertEqual(self.client.post(root + f'{own.pk}/read/', {}, format='json').status_code, 200)

    def test_csrf_required_for_personal_writes(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)
        self.assertEqual(client.post(self.base + 'personal/incidents/', request_data(), format='json').status_code, 403)
