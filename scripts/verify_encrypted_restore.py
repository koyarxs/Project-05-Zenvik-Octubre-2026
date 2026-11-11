"""Migrate/seed ONLY a new UUID source, encrypt/dump/restore and compare fingerprints."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import uuid

from backup import create_backup, restore_new

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path)
    args = parser.parse_args()
    import django

    django.setup()
    import psycopg
    from psycopg import sql
    from django.conf import settings

    if settings.PRODUCTION:
        raise SystemExit("Isolated restore verification refuses production mode.")
    cfg = settings.DATABASES["default"]
    credentials = dict(
        dbname=cfg["NAME"],
        host=cfg["HOST"],
        port=cfg["PORT"],
        user=cfg["USER"],
        password=cfg["PASSWORD"],
        sslmode=cfg["OPTIONS"].get("sslmode", "prefer"),
        connect_timeout=5,
    )
    source = "zenvik_restore_src_" + uuid.uuid4().hex
    created = []
    started = time.monotonic()
    with psycopg.connect(**credentials, autocommit=True) as admin:
        try:
            admin.execute(
                sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                    sql.Identifier(source)
                )
            )
            created.append(source)
            child_env = {
                **os.environ,
                "DJANGO_READ_DOTENV": "False",
                "DJANGO_PRODUCTION": "False",
                "TURNSTILE_ENABLED": "False",
                "BILLING_PAYMENT_MODE": "disabled",
                "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
                "DEBUG": "False",
                "POSTGRES_HOST": str(cfg["HOST"]),
                "POSTGRES_PORT": str(cfg["PORT"]),
                "POSTGRES_DB": source,
                "POSTGRES_USER": cfg["USER"],
                "POSTGRES_PASSWORD": cfg["PASSWORD"],
                "POSTGRES_SSLMODE": credentials["sslmode"],
            }
            # Seed through Django in a child process, never through the operational connection.
            fixture = """
from django.contrib.auth import get_user_model
from businesses.models import Business,Employee,Membership
from attendance.services import record_event
from attendance.serializers import EventInput
from billing.models import Subscription
from uuid import uuid4
u=get_user_model().objects.create_user(username="restore_synthetic",email="restore@example.test")
b=Business.objects.create(name="Synthetic encrypted restore")
Membership.objects.create(user=u,business=b,role="OWNER")
Employee.objects.create(business=b,user=u,first_name="Synthetic",last_name="Test")
Subscription.objects.create(business=b)
s=EventInput(data={"event_type":"CLOCK_IN","request_id":str(uuid4()),"session_id":None,"expected_version":0,"location":None,"location_status":"UNAVAILABLE"})
s.is_valid(raise_exception=True)
record_event(u,b.pk,s.validated_data)
"""
            for command in [
                [sys.executable, "manage.py", "migrate", "--noinput"],
                [sys.executable, "manage.py", "shell", "-c", fixture],
            ]:
                result = subprocess.run(
                    command,
                    cwd=ROOT / "apps/api",
                    env=child_env,
                    capture_output=True,
                    timeout=180,
                )
                if result.returncode:
                    raise RuntimeError(
                        "Isolated restore fixture preparation failed; diagnostics omitted."
                    )
            pg_env = {
                **os.environ,
                "PGHOST": str(cfg["HOST"]),
                "PGPORT": str(cfg["PORT"]),
                "PGUSER": cfg["USER"],
                "PGPASSWORD": cfg["PASSWORD"],
                "PGDATABASE": cfg["NAME"],
                "PGSSLMODE": credentials["sslmode"],
            }

            def fingerprints(database):
                output = {}
                with psycopg.connect(**{**credentials, "dbname": database}) as conn:
                    tables = conn.execute(
                        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
                    ).fetchall()
                    for (table,) in tables:
                        rows = conn.execute(
                            sql.SQL(
                                "SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text"
                            ).format(sql.Identifier(table))
                        ).fetchall()
                        digest = hashlib.sha256(
                            "\n".join(r[0] for r in rows).encode()
                        ).hexdigest()
                        output[table] = {"count": len(rows), "sha256": digest}
                return output

            before = fingerprints(source)
            with tempfile.TemporaryDirectory(prefix="zenvik_backup_verify_") as folder:
                folder = Path(folder)
                key = folder / "ephemeral.key"
                key.write_bytes(secrets.token_bytes(32))
                os.chmod(key, 0o600)
                manifest = create_backup(
                    source, folder / "encrypted", key, pg_bin=args.pg_bin, env=pg_env
                )
                target = restore_new(manifest, key, pg_bin=args.pg_bin, env=pg_env)
                created.append(target)
                after = fingerprints(target)
                if before != after:
                    raise RuntimeError("Restored fingerprints differ.")
                with psycopg.connect(
                    **{**credentials, "dbname": target}, autocommit=True
                ) as conn:
                    valid = (
                        conn.execute(
                            "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated"
                        ).fetchone()[0]
                        == 0
                    )
                    if not valid:
                        raise RuntimeError("Restored constraints not validated.")
                    try:
                        conn.execute(
                            "UPDATE attendance_attendanceevent SET employee_name='tampered'"
                        )
                    except psycopg.errors.RaiseException:
                        immutable = True
                    else:
                        immutable = False
                    if not immutable:
                        raise RuntimeError("Restored attendance evidence is mutable.")
                report = {
                    "restore_verified": True,
                    "encrypted": True,
                    "fingerprints_equal": True,
                    "tables": len(before),
                    "attendance_immutable": True,
                    "constraints_valid": True,
                    "duration_seconds": round(time.monotonic() - started, 2),
                    "source_is_synthetic": True,
                    "operational_data_copied": False,
                    "postgresql_version": admin.info.server_version,
                }
                output = ROOT / ".artifacts/stage16-encrypted-restore.json"
                output.parent.mkdir(exist_ok=True)
                output.write_text(json.dumps(report, indent=2), encoding="utf-8")
                print(json.dumps(report))
        finally:
            for database in reversed(created):
                if database not in (source,) and not database.startswith(
                    "zenvik_restore_dst_"
                ):
                    raise RuntimeError("Cleanup name guard failed.")
                admin.execute(
                    sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                        sql.Identifier(database)
                    )
                )
            print("Only this invocation's synthetic UUID databases were removed.")


if __name__ == "__main__":
    main()
