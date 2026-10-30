"""Run browser tests with a unique, Django-owned temporary PostgreSQL database."""
import os
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ['ZENVIK_E2E'] = '1'

import django
django.setup()

from django.conf import settings
from django.core.management import call_command
from django.db import connection

name = 'zenvik_e2e_' + uuid.uuid4().hex
with connection.cursor() as cursor:
    cursor.execute('SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = %s)', [name])
    if cursor.fetchone()[0]:
        raise SystemExit('Unexpected temporary database collision; aborting.')
settings.DATABASES['default']['TEST']['NAME'] = name
call_command('test', 'businesses.test_browser', interactive=False, verbosity=1)
