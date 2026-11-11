"""Linux/Python 3.13 regression against a Django-owned UUID PostgreSQL database.

Only uses the existing local DB container as a maintenance endpoint to create the
temporary test database. No env file or source credentials are copied into an image.
"""

import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docker", default=shutil.which("docker"))
    parser.add_argument("--db-container", default="zenvik-postgres")
    args = parser.parse_args()
    import django

    django.setup()
    from django.conf import settings

    if settings.PRODUCTION or not args.docker:
        raise SystemExit(
            "A local Docker executable and development configuration are required."
        )
    inspection = subprocess.run(
        [
            args.docker,
            "inspect",
            args.db_container,
            "--format",
            "{{json .NetworkSettings.Networks}}",
        ],
        capture_output=True,
        text=True,
        timeout=20,
        check=True,
    )
    networks = json.loads(inspection.stdout)
    if len(networks) != 1:
        raise SystemExit("Choose a DB container with one explicit private network.")
    cfg = settings.DATABASES["default"]
    child_env = {
        **os.environ,
        "DJANGO_READ_DOTENV": "False",
        "DJANGO_PRODUCTION": "False",
        "DEBUG": "False",
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "ALLOWED_HOSTS": "localhost,127.0.0.1,testserver",
        "TURNSTILE_ENABLED": "False",
        "BILLING_PAYMENT_MODE": "disabled",
        "POSTGRES_HOST": args.db_container,
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": cfg["NAME"],
        "POSTGRES_USER": cfg["USER"],
        "POSTGRES_PASSWORD": cfg["PASSWORD"],
        "POSTGRES_SSLMODE": "prefer",
    }
    keys = [
        "DJANGO_READ_DOTENV",
        "DJANGO_PRODUCTION",
        "DEBUG",
        "DJANGO_SECRET_KEY",
        "ALLOWED_HOSTS",
        "TURNSTILE_ENABLED",
        "BILLING_PAYMENT_MODE",
        "POSTGRES_HOST",
        "POSTGRES_PORT",
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_SSLMODE",
    ]
    command = [
        args.docker,
        "run",
        "--rm",
        "--network",
        next(iter(networks)),
        "--read-only",
        "--mount",
        "type=tmpfs,destination=/tmp,tmpfs-size=67108864,tmpfs-mode=1777",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--mount",
        f"type=bind,src={ROOT / '.artifacts'},dst=/app/.artifacts",
    ]
    for key in keys:
        command.extend(["-e", key])
    command.extend(["zenvik-api:stage16", "python", "run_backend_tests.py"])
    output = ROOT / ".artifacts/stage16-backend-linux.log"
    with output.open("w", encoding="utf-8") as log:
        result = subprocess.run(
            command, env=child_env, stdout=log, stderr=subprocess.STDOUT, timeout=900
        )
    print(
        f"Linux container regression exit code: {result.returncode}; credentials were passed by process environment only."
    )
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
