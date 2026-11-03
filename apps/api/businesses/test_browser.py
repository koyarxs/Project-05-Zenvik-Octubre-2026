"""Opt-in E2E: Django owns a temporary database and serves the actual API."""
import os
import subprocess
import json
import shutil
from threading import Lock
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import skipUnless
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import LiveServerTestCase, override_settings

from .models import Business, Employee, Membership, Shift
from .leave_services import create_leave


@skipUnless(os.environ.get('ZENVIK_E2E') == '1', 'Opt-in browser suite; see apps/web/README.md')
@override_settings(TURNSTILE_ENABLED=False)
class FrontendBrowserTests(LiveServerTestCase):
    host = '127.0.0.1'

    def test_real_frontend_against_isolated_api(self):
        business = Business.objects.create(name='Negocio A de prueba')
        other = Business.objects.create(name='Negocio B de prueba')
        for username, role in (
            ('owner_selection', 'OWNER'), ('owner_security', 'OWNER'),
            ('owner_expiry', 'OWNER'), ('owner_mobile', 'OWNER'),
            ('owner_error', 'OWNER'), ('admin_ui', 'ADMIN'), ('employee_ui', 'EMPLOYEE'),
            ('owner_shifts', 'OWNER'), ('admin_shifts', 'ADMIN'), ('employee_shifts', 'EMPLOYEE'),
            ('owner_shift_mobile', 'OWNER'), ('owner_shift_security', 'OWNER'),
            ('owner_leaves', 'OWNER'), ('admin_leaves', 'ADMIN'), ('employee_leaves', 'EMPLOYEE'),
            ('employee_leave_security', 'EMPLOYEE'),
            ('owner_hardening', 'OWNER'),
            ('owner_design', 'OWNER'), ('owner_directory', 'OWNER'),
            ('owner_design_mobile', 'OWNER'), ('employee_design', 'EMPLOYEE'),
            ('owner_turnstile', 'OWNER'),
            ('owner_gallery', 'OWNER'), ('owner_gallery_mobile', 'OWNER'),
        ):
            user = get_user_model().objects.create_user(username=username, email=f'{username}@example.com', password='Browser-test!pass-9274')
            Membership.objects.create(user=user, business=business, role=role)
            if username == 'owner_selection':
                Membership.objects.create(user=user, business=other, role='ADMIN')
            if username == 'employee_ui':
                Employee.objects.create(business=business, user=user, first_name='Mi ficha', last_name='De prueba')
            elif username == 'employee_shifts':
                shift_worker = Employee.objects.create(business=business, user=user, first_name='Turnos propios', last_name='De prueba')
            elif username == 'employee_leaves':
                leave_user = user
                leave_worker = Employee.objects.create(business=business, user=user, first_name='Solicitante', last_name='De prueba')
            elif username == 'employee_leave_security':
                Employee.objects.create(business=business, user=user, first_name='Otro solicitante', last_name='De prueba')
            elif username == 'employee_design':
                design_user = user
                design_employee = Employee.objects.create(business=business, user=user, first_name='Valentina', last_name='Rojas', email='valentina@example.test')
        colleague = Employee.objects.create(business=business, first_name='Otra ficha', last_name='De prueba')
        foreign = Employee.objects.create(business=other, first_name='Ficha ajena', last_name='De prueba')
        start = datetime(2026, 10, 26, 12, tzinfo=timezone.utc)
        for person in (colleague, shift_worker):
            Shift.objects.create(business=business, employee=person, starts_at=start, ends_at=start + timedelta(hours=3))
        Shift.objects.create(business=business, employee=shift_worker, starts_at=start + timedelta(days=7), ends_at=start + timedelta(days=7, hours=3))
        foreign_shift = Shift.objects.create(business=other, employee=foreign, starts_at=start, ends_at=start + timedelta(hours=3))
        leave = create_leave(leave_user, business.pk, dict(request_type='PERSONAL', start_date='2026-12-01', end_date='2026-12-01', reason='Solicitud para revisión'))
        create_leave(leave_user, business.pk, dict(request_type='DAY_OFF', start_date='2026-12-03', end_date='2026-12-03', reason='Solicitud para rechazo'))
        leave_shift_start = datetime(2026, 12, 1, 12, tzinfo=timezone.utc)
        Shift.objects.create(business=business, employee=leave_worker, starts_at=leave_shift_start, ends_at=leave_shift_start + timedelta(hours=3))
        # Synthetic operational data exists only in this Django-owned temporary DB.
        design_start = datetime.now(ZoneInfo('America/Santiago')).replace(hour=9, minute=0, second=0, microsecond=0)
        mateo = Employee.objects.create(business=business, first_name='Mateo', last_name='Fuentes', email='mateo@example.test')
        for person, offset, hour in ((design_employee, 0, 0), (design_employee, 1, 0), (design_employee, 2, 0), (mateo, 0, 1), (colleague, 0, 4)):
            current = design_start + timedelta(days=offset, hours=hour)
            Shift.objects.create(business=business, employee=person, starts_at=current, ends_at=current + timedelta(hours=8))
        create_leave(design_user, business.pk, dict(request_type='PERSONAL', start_date=(design_start + timedelta(days=3)).date(), end_date=(design_start + timedelta(days=3)).date(), reason='Trámite personal.'))
        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100', 'E2E_BUSINESS_A': str(business.pk), 'E2E_BUSINESS_B': str(other.pk), 'E2E_COLLEAGUE': str(colleague.pk), 'E2E_FOREIGN': str(foreign.pk), 'E2E_FOREIGN_SHIFT': str(foreign_shift.pk)}
        env['E2E_LEAVE'] = str(leave.pk)
        root = Path(__file__).resolve().parents[2] / 'web'
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test'], cwd=root, env=env, timeout=600, check=False)
        self.assertEqual(result.returncode, 0, 'Browser suite failed; inspect Playwright report.')
        # Preserve only synthetic screenshots before the Turnstile phase resets
        # Playwright's output directory. Cookies, traces and bodies are excluded.
        screenshots = root.parent.parent / '.artifacts' / 'release'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (root / 'test-results').glob('*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)
    def test_personnel_frontend_against_isolated_api(self):
        business = Business.objects.create(name='Equipo de prueba')
        other = Business.objects.create(name='Otro equipo')
        for username, role in [('owner_personnel', 'OWNER'), ('admin_personnel', 'ADMIN'), ('worker_personnel', 'EMPLOYEE'), ('unlinked_personnel', 'EMPLOYEE')]:
            user = get_user_model().objects.create_user(username=username, email=f'{username}@example.test', password='Browser-test!pass-9274')
            Membership.objects.create(user=user, business=business, role=role)
            if username == 'worker_personnel':
                employee = Employee.objects.create(business=business, user=user, first_name='Clara', last_name='Test', job_title='Atención', phone='+56 9 1234 5678', admin_notes='Nota reservada del equipo')
        foreign = Employee.objects.create(business=other, first_name='Privada', last_name='Test')
        start = datetime(2026, 12, 10, 12, tzinfo=timezone.utc)
        Shift.objects.create(business=business, employee=employee, starts_at=start, ends_at=start + timedelta(hours=4))
        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100',
               'E2E_BUSINESS_A': str(business.pk), 'E2E_BUSINESS_B': str(other.pk), 'E2E_EMPLOYEE': str(employee.pk), 'E2E_FOREIGN': str(foreign.pk), 'E2E_PERSONNEL': '1'}
        root = Path(__file__).resolve().parents[2] / 'web'
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/personnel.spec.ts'], cwd=root, env=env, timeout=240, check=False)
        self.assertEqual(result.returncode, 0, 'Personnel browser suite failed.')
        screenshots = root.parent.parent / '.artifacts' / 'stage10'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (root / 'test-results').glob('*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)

    def test_portal_frontend_against_isolated_api(self):
        business = Business.objects.create(name='Portal de prueba')
        other = Business.objects.create(name='Segundo espacio')
        user = get_user_model().objects.create_user(username='worker_portal', email='portal@example.test', password='Browser-test!pass-9274')
        Membership.objects.create(user=user, business=business, role='EMPLOYEE')
        Membership.objects.create(user=user, business=other, role='EMPLOYEE')
        employee = Employee.objects.create(business=business, user=user, first_name='Clara', last_name='Portal', job_title='Operadora', phone='+56 9 1234 5678', admin_notes='Secreto interno')
        colleague = Employee.objects.create(business=business, first_name='Ficha privada', last_name='Ajena')
        start = datetime.now(ZoneInfo('America/Santiago')).replace(hour=23, minute=0, second=0, microsecond=0) + timedelta(days=1)
        Shift.objects.create(business=business, employee=employee, starts_at=start, ends_at=start + timedelta(hours=8), notes='Turno nocturno de prueba', break_minutes=30)
        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100',
               'E2E_BUSINESS_A': str(business.pk), 'E2E_BUSINESS_B': str(other.pk), 'E2E_COLLEAGUE': str(colleague.pk), 'E2E_EMPLOYEE': str(employee.pk), 'E2E_PORTAL': '1'}
        root = Path(__file__).resolve().parents[2] / 'web'
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/portal.spec.ts'], cwd=root, env=env, timeout=240, check=False)
        self.assertEqual(result.returncode, 0, 'Worker portal browser suite failed.')
        screenshots = root.parent.parent / '.artifacts' / 'stage11'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (root / 'test-results').glob('*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)

    def test_attendance_frontend_against_isolated_api(self):
        from attendance.services import configure_policy, record_event
        from attendance.serializers import EventInput
        from uuid import uuid4
        business = Business.objects.create(name='Asistencia de prueba')
        people = {}
        for name, role in [('attendance_worker', 'EMPLOYEE'), ('attendance_exception', 'EMPLOYEE'), ('attendance_peer', 'EMPLOYEE'), ('attendance_owner', 'OWNER')]:
            user = get_user_model().objects.create_user(username=name, email=f'{name}@example.test', password='Browser-test!pass-9274')
            Membership.objects.create(user=user, business=business, role=role)
            person = Employee.objects.create(business=business, user=user, first_name=name, last_name='Prueba')
            people[name] = (user, person)
        configure_policy(people['attendance_owner'][0], business.pk, {'expected_version': 0, 'location_required': True, 'max_accuracy_meters': 100, 'retention_days': None, 'sites': [{'name': 'Zona sintética E2E', 'latitude': -33.45, 'longitude': -70.66, 'radius_meters': 150, 'is_active': True}]})
        data = EventInput(data={'event_type': 'CLOCK_IN', 'request_id': str(uuid4()), 'session_id': None, 'expected_version': 0, 'location': {'latitude': -33.45, 'longitude': -70.66, 'accuracy_meters': 10}, 'location_status': 'AVAILABLE'})
        data.is_valid(raise_exception=True)
        peer_event, _ = record_event(people['attendance_peer'][0], business.pk, data.validated_data)
        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100', 'E2E_BUSINESS_A': str(business.pk), 'E2E_ATTENDANCE': '1', 'E2E_PEER_RECEIPT': str(peer_event.pk)}
        root = Path(__file__).resolve().parents[2] / 'web'
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/attendance.spec.ts'], cwd=root, env=env, timeout=240, check=False)
        self.assertEqual(result.returncode, 0, 'Attendance browser suite failed.')
        screenshots = root.parent.parent / '.artifacts' / 'stage13'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (root / 'test-results').glob('*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)

    def test_planning_frontend_against_isolated_api(self):
        # Separate phase keeps realistic authentication rate limits unchanged.
        business = Business.objects.create(name='Planificación de prueba')
        user = get_user_model().objects.create_user(username='owner_planning', email='planning@example.test', password='Browser-test!pass-9274')
        Membership.objects.create(user=user, business=business, role='OWNER')
        employee = Employee.objects.create(business=business, first_name='Planificación', last_name='Test')
        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100',
               'E2E_BUSINESS_A': str(business.pk), 'E2E_COLLEAGUE': str(employee.pk), 'E2E_PLANNING': '1'}
        root = Path(__file__).resolve().parents[2] / 'web'
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/planning.spec.ts'], cwd=root, env=env, timeout=240, check=False)
        self.assertEqual(result.returncode, 0, 'Planning browser suite failed.')
        screenshots = root.parent.parent / '.artifacts' / 'stage9'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (root / 'test-results').glob('*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)

    def test_turnstile_frontend_against_isolated_api(self):
        # LiveServerTestCase gives this phase fresh fixtures and rate-limit rows.
        # Do not raise/disable authentication limits to accommodate suite size.
        business = Business.objects.create(name='Negocio Turnstile de prueba')
        user = get_user_model().objects.create_user(
            username='owner_turnstile', email='owner-turnstile@example.test', password='Browser-test!pass-9274')
        Membership.objects.create(user=user, business=business, role='OWNER')
        env = {**os.environ, 'DJANGO_API_URL': self.live_server_url, 'APP_ORIGIN': 'http://127.0.0.1:3100',
               'E2E_BUSINESS_A': str(business.pk)}
        root = Path(__file__).resolve().parents[2] / 'web'
        # An isolated provider stub exercises our frontend/backend protocol, not
        # Cloudflare's infrastructure or a production CAPTCHA challenge.
        used_tokens = set()
        token_lock = Lock()

        def siteverify(request, **kwargs):
            token = json.loads(request.data)['response']
            with token_lock:
                valid = token.startswith(('login-fixture-', 'register-fixture-')) and token not in used_tokens
                used_tokens.add(token)
            result = MagicMock()
            result.__enter__.return_value.read.return_value = json.dumps({
                'success': valid, 'hostname': '127.0.0.1', 'action': token.split('-fixture-')[0],
            }).encode()
            return result

        with override_settings(TURNSTILE_ENABLED=True, TURNSTILE_SITE_KEY='public-e2e-fixture',
                TURNSTILE_SECRET_KEY='private-e2e-fixture', TURNSTILE_ALLOWED_HOSTNAMES=['127.0.0.1']), patch('accounts.turnstile.urlopen', side_effect=siteverify):
            result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/turnstile.spec.ts'],
                cwd=root, env={**env, 'E2E_TURNSTILE': '1'}, timeout=180, check=False)
            self.assertEqual(result.returncode, 0, 'Turnstile integration browser suite failed.')
    def test_incidents_frontend_against_isolated_api(self):
        from attendance.services import record_event
        from attendance.serializers import EventInput
        from unittest.mock import patch
        from uuid import uuid4
        business = Business.objects.create(name='Incidencias de prueba')
        other = Business.objects.create(name='Otro negocio de incidencias')
        people = {}
        for name, role in [('incident_worker', 'EMPLOYEE'), ('incident_owner', 'OWNER')]:
            user = get_user_model().objects.create_user(username=name, email=f'{name}@example.test', password='Browser-test!pass-9274')
            Membership.objects.create(user=user, business=business, role=role)
            employee = Employee.objects.create(business=business, user=user, first_name=name, last_name='Prueba')
            people[name] = (user, employee)
        Membership.objects.create(user=people['incident_owner'][0], business=other, role='OWNER')
        current = datetime.now(ZoneInfo('America/Santiago'))
        original_time = current - timedelta(hours=2)
        data = EventInput(data={'event_type':'CLOCK_IN','request_id':str(uuid4()),'session_id':None,'expected_version':0,'location':None,'location_status':'UNAVAILABLE'})
        data.is_valid(raise_exception=True)
        with patch('attendance.services.timezone.now', return_value=original_time):
            event, _ = record_event(people['incident_worker'][0], business.pk, data.validated_data)
        env = {**os.environ, 'DJANGO_API_URL':self.live_server_url, 'APP_ORIGIN':'http://127.0.0.1:3100', 'E2E_BUSINESS_A':str(business.pk), 'E2E_BUSINESS_B':str(other.pk), 'E2E_INCIDENTS':'1', 'E2E_INCIDENT_SESSION':str(event.session_id), 'E2E_INCIDENT_EVENT':str(event.pk), 'E2E_INCIDENT_DATE':event.session.work_date.isoformat(), 'E2E_DECLARED_TIME':(current-timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')}
        root = Path(__file__).resolve().parents[2] / 'web'
        result = subprocess.run(['node', str(root / 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/incidents.spec.ts'], cwd=root, env=env, timeout=240, check=False)
        self.assertEqual(result.returncode, 0, 'Incidents browser suite failed.')
        screenshots = root.parent.parent / '.artifacts' / 'stage14'
        screenshots.mkdir(parents=True, exist_ok=True)
        for screenshot in (root / 'test-results').glob('*.png'):
            shutil.copy2(screenshot, screenshots / screenshot.name)
