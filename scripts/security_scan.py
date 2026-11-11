"""Current source scan without Git/history access. Prints rule/path, never values."""

import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {
    ".git",
    "node_modules",
    ".next",
    ".venv",
    ".artifacts",
    "__pycache__",
    "test-results",
    "playwright-report",
    ".aws",
    ".codex",
    ".agents",
}
PATTERNS = {
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "aws_access_id": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
}
known = []
env_path = ROOT / ".env"
if env_path.is_file():
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        key, _, value = line.partition("=")
        if (
            key in ("DJANGO_SECRET_KEY", "POSTGRES_PASSWORD")
            and len(value.strip()) >= 16
        ):
            known.append(value.strip().strip("\"'"))
issues = []
scanned = 0
for folder, directories, files in os.walk(ROOT):
    directories[:] = [d for d in directories if d not in EXCLUDED]
    for name in files:
        if name.startswith(".env") and not name.endswith(".example"):
            continue
        path = Path(folder) / name
        if path.is_symlink() or path.stat().st_size > 2 * 1024 * 1024:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeError, OSError):
            continue
        scanned += 1
        for rule, pattern in PATTERNS.items():
            if pattern.search(text):
                issues.append((rule, str(path.relative_to(ROOT))))
        if any(secret in text for secret in known):
            issues.append(("current_secret_in_source", str(path.relative_to(ROOT))))
for rule, path in issues:
    print(f"FAIL {rule}: {path}")
print(
    f"Source files checked: {scanned}; findings: {len(issues)}; Git history not inspected."
)
raise SystemExit(1 if issues else 0)
