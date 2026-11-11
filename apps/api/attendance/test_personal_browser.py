"""Opt-in real HTTP checks. Django owns and destroys the synthetic test database."""

import os
import shutil
import subprocess
from datetime import timedelta
from pathlib import Path
from unittest import skipUnless
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone

from businesses.models import Business, Employee, Membership, Shift
from .incidents import create_incident
from .models import AttendanceNotification
from .services import configure_policy, record_event
from .test_incidents import cleaned, request_data
from .tests import payload, validated


@skipUnless(os.environ.get('ZENVIK_E2E') == '1', 'Opt-in personal attendance browser suite')
@override_settings(TURNSTILE_ENABLED=False)
class PersonalAttendanceBrowserTests(LiveServerTestCase):
    host = '127.0.0.1'

    def test_personal_attendance_against_isolated_api(self):
        first = Business.objects.create(name='Café de prueba personal')
        second = Business.objects.create(name='Segundo negocio personal')
        foreign = Business.objects.create(name='Negocio no autorizado')
        people = {}
        names = ['main', 'retry', 'exception', 'multi', 'owner', 'peer', 'no_profile', 'no_business', 'followup', 'leaves', 'reject']
        for name in names:
            user = get_user_model().objects.create_user(username=f'personal_{name}', email=f'personal-{name}@example.test', password='Browser-test!pass-9274')
            if name != 'no_business':
                Membership.objects.create(user=user, business=first, role='OWNER' if name == 'owner' else 'EMPLOYEE')
            employee = None
            if name not in ('no_profile', 'no_business'):
                employee = Employee.objects.create(user=user, business=first, first_name={'main': 'Valentina', 'multi': 'Ficha primera'}.get(name, f'Persona {name}'), last_name='Prueba')
            people[name] = (user, employee)
        Membership.objects.create(user=people['multi'][0], business=second, role='EMPLOYEE')
        Employee.objects.create(user=people['multi'][0], business=second, first_name='Ficha segunda', last_name='Prueba')
        now = timezone.now()
        zone = ZoneInfo('America/Santiago')
        for name in ('main', 'multi'):
            Shift.objects.create(business=first, employee=people[name][1], starts_at=now-timedelta(minutes=15), ends_at=now+timedelta(hours=7))
        configure_policy(people['owner'][0], first.pk, {'expected_version': 0, 'location_required': True, 'max_accuracy_meters': 100, 'retention_days': None,
            'sites': [{'name': 'Zona personal sintética', 'latitude': -33.45, 'longitude': -70.66, 'radius_meters': 150, 'is_active': True}]})
        peer_event, _ = record_event(people['peer'][0], first.pk, validated(payload()))
        with patch('attendance.services.timezone.now', return_value=now-timedelta(hours=2)):
            followup, _ = record_event(people['followup'][0], first.pk, validated(payload()))
        # Both an own and a peer request exist for the manager-scope regression.
        for name in ('owner', 'peer'):
            create_incident(people[name][0], first.pk, cleaned(request_data(category='OTHER', event_type='', declared_at=None, work_date=now.astimezone(zone).date().isoformat())))
        AttendanceNotification.objects.create(business=first, recipient=people['owner'][0], code='INCIDENT_CREATED', dedupe_key='manager-only-fixture', manager_only=True)
        AttendanceNotification.objects.create(business=first, recipient=people['owner'][0], code='INCIDENT_APPROVED', dedupe_key='personal-fixture', manager_only=False)
        root = Path(__file__).resolve().parents[2] / 'web'
        environment = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100',
            'E2E_BUSINESS_A': str(first.pk), 'E2E_BUSINESS_B': str(second.pk), 'E2E_PERSONAL': '1',
            'E2E_PERSONAL_FOREIGN': str(foreign.pk), 'E2E_PERSONAL_PEER_RECEIPT': str(peer_event.pk),
            'E2E_PERSONAL_FOLLOWUP': str(followup.pk), 'E2E_PERSONAL_FOLLOWUP_HASH': followup.integrity_hash,
            'E2E_PERSONAL_DECLARED': (now-timedelta(hours=1)).astimezone(zone).strftime('%Y-%m-%dT%H:%M')}
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/personal-attendance.spec.ts'], cwd=root, env=environment, timeout=600, check=False)
        self.assertEqual(result.returncode, 0, 'Personal attendance browser suite failed; inspect its local report.')
        destination = root.parent.parent / '.artifacts' / 'personal-attendance'
        destination.mkdir(parents=True, exist_ok=True)
        for image in (root / 'test-results').glob('personal-*.png'):
            shutil.copy2(image, destination / image.name)
