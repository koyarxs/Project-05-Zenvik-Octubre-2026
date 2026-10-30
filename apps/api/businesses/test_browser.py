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
