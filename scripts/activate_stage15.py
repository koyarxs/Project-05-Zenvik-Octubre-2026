"""Apply additive local migrations and record hashes, never record row contents.

Run from repository root with apps/api/.venv/Scripts/python.exe scripts/activate_stage15.py.
No credentials, data resets, plan prices, or paid activations are created here.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps' / 'api'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.db import connection

if settings.PRODUCTION:
    raise SystemExit('Este procedimiento se limita al entorno local.')


def fingerprint():
    result = {}
    for model in apps.get_models():
        if model._meta.app_label not in ('accounts', 'businesses', 'attendance') or model._meta.model_name == 'authratelimit':
            continue
        digest = hashlib.sha256()
        count = 0
        for row in model.objects.order_by('pk').values().iterator():
            digest.update(json.dumps(row, sort_keys=True, default=str, ensure_ascii=False).encode())
            count += 1
        result[model._meta.label] = {'count': count, 'sha256': digest.hexdigest()}
    return result


before = fingerprint()
call_command('migrate', plan=True)
call_command('migrate', interactive=False)
call_command('check')
call_command('migrate', check=True)
after = fingerprint()
with connection.cursor() as cursor:
    cursor.execute('SHOW server_version')
    version = cursor.fetchone()[0]
report = {'postgresql_version': version, 'preserved': before == after, 'before': before, 'after': after}
target = ROOT / '.artifacts' / 'stage15-migration.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f'Integridad anterior conservada: {report["preserved"]}; modelos comprobados: {len(before)}')
if before != after:
    raise SystemExit('Los hashes cambiaron. Revisar actividad concurrente antes de atribuir cambios a la migración.')
