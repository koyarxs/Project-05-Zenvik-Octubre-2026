"""Prepared scheduler entrypoint. Disabled until explicitly configured by operator."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess

from backup import create_backup


def main():
    if os.environ.get("BACKUP_ENABLED") != "true":
        raise SystemExit(
            "Backups are not activated. Configure a protected environment first."
        )
    database = os.environ["PGDATABASE"]
    output_root = Path(os.environ["BACKUP_OUTPUT_ROOT"])
    manifest = create_backup(
        database, output_root, os.environ["BACKUP_KEY_FILE"], allow_operational=True
    )
    document = json.loads(manifest.read_text(encoding="utf-8"))
    remote = os.environ["BACKUP_S3_PREFIX"]
    if not re.fullmatch(r"s3://[a-z0-9][a-z0-9.-]+/[A-Za-z0-9/_-]+/", remote):
        raise ValueError("Use an explicit protected backup prefix.")
    # Ambient workload identity/role, never credentials on the command line.
    for path in [manifest.parent / document["file"], manifest]:
        result = subprocess.run(
            [
                "aws",
                "s3",
                "cp",
                str(path),
                remote + path.name,
                "--only-show-errors",
                "--sse",
                "aws:kms",
                "--sse-kms-key-id",
                os.environ["BACKUP_KMS_KEY_ID"],
            ],
            capture_output=True,
            timeout=300,
        )
        if result.returncode:
            raise RuntimeError(
                "Encrypted offsite backup upload failed; provider details omitted."
            )
    state = {
        "event": "backup_uploaded",
        "last_success_utc": datetime.now(timezone.utc).isoformat(),
        "backup_id": document["backup_id"],
        "restore_verified": False,
    }
    temporary = output_root / "last-success.tmp"
    temporary.write_text(json.dumps(state), encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(output_root / "last-success.json")
    print(json.dumps(state))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"event": "backup_failed", "severity": "error"}))
        raise SystemExit(1) from None
