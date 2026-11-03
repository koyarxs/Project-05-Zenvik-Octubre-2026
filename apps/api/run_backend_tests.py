"""Run all backend tests in a unique temporary database; never reuse an existing DB."""
import os
import uuid
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.conf import settings
from django.core.management import call_command
from django.db import connection
name = 'zenvik_test_' + uuid.uuid4().hex
with connection.cursor() as cursor:
    cursor.execute('SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = %s)', [name])
    if cursor.fetchone()[0]:
        raise SystemExit('Temporary database collision; aborting.')
settings.DATABASES['default']['TEST']['NAME'] = name
call_command('test', *sys.argv[1:], interactive=False, verbosity=1)
