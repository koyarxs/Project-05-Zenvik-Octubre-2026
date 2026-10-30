"""Exercise pg_dump/pg_restore using only databases this invocation creates.

Run from apps/api with its virtualenv. Requires CREATEDB and PostgreSQL client
tools on PATH (or --pg-bin). Never dumps or restores the configured application DB.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    args = parser.parse_args()
    executables = {}
    for name in ('pg_dump', 'pg_restore'):
        candidate = args.pg_bin / (name + ('.exe' if os.name == 'nt' else '')) if args.pg_bin else shutil.which(name)
        if not candidate or not Path(candidate).is_file():
            raise SystemExit(f'{name} not found; supply --pg-bin.')
        executables[name] = str(candidate)

    import django
    django.setup()
    import psycopg
    from psycopg import sql
    from django.conf import settings
    from django.core.management import call_command
    from django.db import connection
    from django.contrib.auth import get_user_model
    from businesses.models import Business, Employee, Membership, Shift
    from businesses.leave_services import create_leave, decide_leave
    from datetime import datetime, timedelta, timezone

    config = settings.DATABASES['default'].copy()
    credentials = dict(dbname=config['NAME'], host=config['HOST'], port=config['PORT'], user=config['USER'], password=config['PASSWORD'], sslmode=config['OPTIONS'].get('sslmode', 'prefer'))
    marker = uuid.uuid4().hex
    source, target = f'zenvik_restore_src_{marker}', f'zenvik_restore_dst_{marker}'
    if config['NAME'] in (source, target):
        raise RuntimeError('Isolated database names must differ from the application database.')
    created = []
    connection.close()
    with psycopg.connect(**credentials, autocommit=True) as maintenance:
        try:
            for name in (source, target):
                maintenance.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(name)))
                created.append(name)
            connection.settings_dict['NAME'] = source
            with connection.cursor() as cursor:
                cursor.execute('SELECT current_database()')
                if cursor.fetchone()[0] != source:
                    raise RuntimeError('Isolated database guard failed.')
            call_command('migrate', interactive=False, verbosity=0)
            owner = get_user_model().objects.create_user(username='restore_owner', email='owner@example.test')
            worker = get_user_model().objects.create_user(username='restore_worker', email='worker@example.test')
            business = Business.objects.create(name='Synthetic restore verification')
            Membership.objects.create(business=business, user=owner, role='OWNER')
            Membership.objects.create(business=business, user=worker, role='EMPLOYEE')
            employee = Employee.objects.create(business=business, user=worker, first_name='Synthetic', last_name='Worker')
            start = datetime(2026, 12, 1, 12, tzinfo=timezone.utc)
            Shift.objects.create(business=business, employee=employee, starts_at=start, ends_at=start + timedelta(hours=8))
            leave = create_leave(worker, business.pk, dict(request_type='OTHER', start_date='2026-12-01', end_date='2026-12-01', reason='Synthetic restore verification'))
            decide_leave(owner, business.pk, leave.pk, 'approve', 'Synthetic decision')
            tables = connection.introspection.table_names()
            with connection.cursor() as cursor:
                expected = {}
                for table in tables:
                    cursor.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table)))
                    expected[table] = cursor.fetchone()[0]
            connection.close()
            child_env = {**os.environ, 'PGHOST': str(config['HOST']), 'PGPORT': str(config['PORT']), 'PGUSER': config['USER'], 'PGPASSWORD': config['PASSWORD'], 'PGSSLMODE': credentials['sslmode']}
            with tempfile.TemporaryDirectory(prefix='zenvik_restore_') as folder:
                archive = Path(folder) / 'synthetic.dump'
                commands = [
                    [executables['pg_dump'], '--no-password', '--format=custom', '--no-owner', '--no-privileges', '--file', str(archive), '--dbname', source],
                    [executables['pg_restore'], '--no-password', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', target, str(archive)],
                ]
                for command in commands:
                    result = subprocess.run(command, env=child_env, capture_output=True, timeout=120, check=False)
                    if result.returncode:
                        raise RuntimeError(f'{Path(command[0]).stem} failed (exit {result.returncode}); no credentials logged.')
                print('Archive SHA256:', hashlib.sha256(archive.read_bytes()).hexdigest())
                with psycopg.connect(**{**credentials, 'dbname': target}) as restored:
                    for table, count in expected.items():
                        actual = restored.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table))).fetchone()[0]
                        if actual != count:
                            raise RuntimeError('Restored table count mismatch.')
                    row = restored.execute('SELECT status, reviewed_by_id IS NOT NULL, reviewed_at IS NOT NULL FROM leave_requests').fetchone()
                    if row != ('APPROVED', True, True):
                        raise RuntimeError('Restored decision audit mismatch.')
                    invalid_constraints = restored.execute("SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated").fetchone()[0]
                    if invalid_constraints:
                        raise RuntimeError('Unvalidated restored constraints.')
                print(f'Restore verified: {len(tables)} tables, all row counts, decision audit and constraints preserved.')
        finally:
            connection.close()
            connection.settings_dict['NAME'] = config['NAME']
            for name in reversed(created):
                if name in (source, target) and re.fullmatch(r'zenvik_restore_(src|dst)_[a-f0-9]{32}', name) and name != config['NAME']:
                    maintenance.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
            print('Isolated restore databases removed; application database was not dumped or restored.')


if __name__ == '__main__':
    main()
