"""Exercise prepared roles using only a UUID database and roles created here.

Never modifies the configured application database or existing roles/passwords.
Requires an administrative local test connection; no credentials in arguments/logs.
"""

import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
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
        raise SystemExit("Refusing to provision a role test in production mode.")
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
    suffix = uuid.uuid4().hex
    database = "zenvik_role_test_" + suffix
    owner, migrator, runtime = (
        f"z16_{kind}_{suffix}" for kind in ("owner", "migrator", "runtime")
    )
    password_migration, password_runtime = (
        secrets.token_urlsafe(32),
        secrets.token_urlsafe(32),
    )
    psql = (
        str(args.pg_bin / ("psql.exe" if os.name == "nt" else "psql"))
        if args.pg_bin
        else shutil.which("psql")
    )
    if not psql or not Path(psql).is_file():
        raise SystemExit("psql is required; supply --pg-bin.")
    created_database = False
    created_roles = []
    with psycopg.connect(**credentials, autocommit=True) as admin:
        try:
            admin.execute(
                sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                    sql.Identifier(database)
                )
            )
            created_database = True
            child_env = {
                **os.environ,
                "PGHOST": str(cfg["HOST"]),
                "PGPORT": str(cfg["PORT"]),
                "PGUSER": cfg["USER"],
                "PGPASSWORD": cfg["PASSWORD"],
                "PGDATABASE": database,
                "PGSSLMODE": credentials["sslmode"],
            }
            variables = [
                "-v",
                f"database_name={database}",
                "-v",
                f"owner_role={owner}",
                "-v",
                f"migration_role={migrator}",
                "-v",
                f"runtime_role={runtime}",
            ]
            result = subprocess.run(
                [
                    psql,
                    "-X",
                    "--no-password",
                    *variables,
                    "-f",
                    str(ROOT / "infra/postgres/bootstrap.sql"),
                ],
                env=child_env,
                capture_output=True,
                timeout=30,
            )
            if result.returncode:
                raise RuntimeError(
                    "Isolated role bootstrap failed; no SQL or credentials logged."
                )
            created_roles.extend([runtime, migrator, owner])
            for role, password in [
                (migrator, password_migration),
                (runtime, password_runtime),
            ]:
                admin.execute(
                    sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                        sql.Identifier(role), sql.Literal(password)
                    )
                )
            migration_env = {
                **os.environ,
                "DJANGO_READ_DOTENV": "False",
                "DJANGO_PRODUCTION": "False",
                "TURNSTILE_ENABLED": "False",
                "BILLING_PAYMENT_MODE": "disabled",
                "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
                "DEBUG": "False",
                "POSTGRES_HOST": str(cfg["HOST"]),
                "POSTGRES_PORT": str(cfg["PORT"]),
                "POSTGRES_DB": database,
                "POSTGRES_USER": migrator,
                "POSTGRES_PASSWORD": password_migration,
                "POSTGRES_ROLE": owner,
                "POSTGRES_SSLMODE": credentials["sslmode"],
            }
            result = subprocess.run(
                [sys.executable, "manage.py", "migrate", "--noinput"],
                cwd=ROOT / "apps/api",
                env=migration_env,
                capture_output=True,
                timeout=120,
            )
            if result.returncode:
                raise RuntimeError(
                    "Migrations as the isolated migration role failed; sensitive diagnostics omitted."
                )
            result = subprocess.run(
                [
                    psql,
                    "-X",
                    "--no-password",
                    *variables,
                    "-f",
                    str(ROOT / "infra/postgres/grants.sql"),
                ],
                env=child_env,
                capture_output=True,
                timeout=30,
            )
            if result.returncode:
                raise RuntimeError("Isolated runtime grants failed.")
            runtime_credentials = {
                **credentials,
                "dbname": database,
                "user": runtime,
                "password": password_runtime,
            }
            checks = {}
            with psycopg.connect(**runtime_credentials, autocommit=True) as app:
                flags = app.execute(
                    "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user"
                ).fetchone()
                checks["runtime_unprivileged"] = not any(flags)
                checks["read_catalog"] = (
                    app.execute("SELECT count(*) FROM billing_plan").fetchone()[0] == 3
                )
                business_id = uuid.uuid4()
                app.execute(
                    "INSERT INTO businesses (id,name,rut,legal_name,industry,region,commune,locality,address,contact_email,contact_phone,primary_location,created_at,updated_at,is_active,planning_block_leave,planning_timezone) VALUES (%s,%s,'','','','','','','','','','',now(),now(),true,true,'America/Santiago')",
                    (business_id, "Synthetic role test"),
                )
                app.execute(
                    "UPDATE businesses SET name=%s WHERE id=%s",
                    ("Synthetic revised", business_id),
                )
                checks["runtime_dml"] = (
                    app.execute(
                        "SELECT name FROM businesses WHERE id=%s", (business_id,)
                    ).fetchone()[0]
                    == "Synthetic revised"
                )
                for key, statement in [
                    ("no_ddl", "CREATE TABLE forbidden_probe (id int)"),
                    ("no_create_database", "CREATE DATABASE forbidden_probe"),
                    ("no_create_role", "CREATE ROLE forbidden_probe"),
                    ("no_migration_write", "DELETE FROM django_migrations"),
                    (
                        "no_schema_change",
                        "ALTER TABLE businesses ADD COLUMN forbidden_probe int",
                    ),
                ]:
                    try:
                        app.execute(statement)
                    except psycopg.errors.InsufficientPrivilege:
                        checks[key] = True
                    else:
                        checks[key] = False
            if not all(checks.values()):
                raise RuntimeError("Least-privilege verification failed.")
            report = {
                "checks": checks,
                "server_version": admin.info.server_version,
                "application_database_untouched": True,
                "ephemeral_resources_only": True,
            }
            output = ROOT / ".artifacts/stage16-postgres-roles.json"
            output.parent.mkdir(exist_ok=True)
            output.write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(json.dumps(report))
        finally:
            if created_database:
                admin.execute(
                    sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                        sql.Identifier(database)
                    )
                )
            for role in created_roles:
                admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))
            print("Only the UUID role-test database and its new roles were removed.")


if __name__ == "__main__":
    main()
