"""Run deployment checks with ephemeral synthetic settings, not real secrets/TLS."""

import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
env = {
    **os.environ,
    "DJANGO_READ_DOTENV": "False",
    "DJANGO_PRODUCTION": "True",
    "APP_ENVIRONMENT": "staging",
    "DEBUG": "False",
    "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
    "ALLOWED_HOSTS": "staging.example.invalid",
    "DJANGO_BEHIND_PROXY": "True",
    "TRUSTED_PROXY_CIDRS": "192.0.2.10/32",
    "CSRF_TRUSTED_ORIGINS": "https://staging.example.invalid",
    "PUBLIC_REGISTRATION_ENABLED": "False",
    "DJANGO_ADMIN_ENABLED": "False",
    "TURNSTILE_ENABLED": "False",
    "BILLING_PAYMENT_MODE": "disabled",
    "POSTGRES_HOST": "database.example.invalid",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "synthetic_config_check",
    "POSTGRES_USER": "synthetic_runtime",
    "POSTGRES_PASSWORD": secrets.token_urlsafe(32),
    "POSTGRES_SSLMODE": "verify-full",
}
for name in ["DJANGO_SECRET_KEY_FILE", "POSTGRES_PASSWORD_FILE"]:
    env.pop(name, None)
cli = subprocess.run(
    [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
    cwd=ROOT / "apps/api",
    env=env,
    capture_output=True,
    text=True,
    timeout=30,
)
(ROOT / ".artifacts").mkdir(exist_ok=True)
(ROOT / ".artifacts/stage16-deploy-check-cli.log").write_text(
    cli.stdout + cli.stderr, encoding="utf-8"
)
code = """
import os,json,django
os.environ.setdefault("DJANGO_SETTINGS_MODULE","config.settings")
django.setup()
from django.core.checks import run_checks
issues=run_checks(include_deployment_checks=True)
print(json.dumps([{"id":i.id,"level":i.level,"message":str(i.msg)} for i in issues]))
"""
result = subprocess.run(
    [sys.executable, "-c", code],
    cwd=ROOT / "apps/api",
    env=env,
    capture_output=True,
    text=True,
    timeout=30,
)
if result.returncode:
    raise SystemExit(
        "Synthetic deployment configuration failed; sensitive diagnostics omitted."
    )
issues = json.loads(result.stdout)
for issue in issues:
    print(issue["id"], issue["message"])
unexpected = [i for i in issues if i["id"] not in ("security.W005", "security.W021")]
report = {
    "manage_py_check_deploy_exit_code": cli.returncode,
    "synthetic_configuration": True,
    "real_https_verified": False,
    "issues": issues,
    "unexpected_issues": unexpected,
    "intentional": "HSTS includeSubDomains and preload remain disabled until domains are verified.",
}
(ROOT / ".artifacts").mkdir(exist_ok=True)
(ROOT / ".artifacts/stage16-deploy-check.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
raise SystemExit(1 if unexpected else 0)
