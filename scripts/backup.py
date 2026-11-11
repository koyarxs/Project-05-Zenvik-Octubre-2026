"""Encrypted PostgreSQL logical backups. No plaintext or credentials in logs.

The CLI refuses operational databases unless explicitly authorized by its flag.
Restoration is always to a new UUID database, never an existing database.
Requires requirements-operations.txt in an isolated environment.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import uuid

MAGIC = b"ZENVIK16\0"
CHUNK = 1024 * 1024
TEST_DATABASE = re.compile(
    r"zenvik_(?:test|restore_src|restore_dst|backup_test)_[a-f0-9]{32}\Z"
)


def key_from_file(path):
    key = Path(path).read_bytes()
    if len(key) != 32:
        raise ValueError("Backup key must be exactly 32 bytes from a secure key store.")
    return key


def encrypt(source, target, key):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    nonce = secrets.token_bytes(12)
    encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(MAGIC)
    with Path(source).open("rb") as reader, Path(target).open("xb") as writer:
        os.chmod(target, 0o600)
        writer.write(MAGIC + nonce)
        while chunk := reader.read(CHUNK):
            writer.write(encryptor.update(chunk))
        writer.write(encryptor.finalize())
        writer.write(encryptor.tag)


def decrypt(source, target, key):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    source = Path(source)
    if source.stat().st_size < len(MAGIC) + 12 + 16:
        raise ValueError("Truncated backup.")
    with source.open("rb") as reader:
        if reader.read(len(MAGIC)) != MAGIC:
            raise ValueError("Unknown backup format.")
        nonce = reader.read(12)
        reader.seek(-16, 2)
        tag = reader.read(16)
        reader.seek(len(MAGIC) + 12)
        remaining = source.stat().st_size - len(MAGIC) - 12 - 16
        decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
        decryptor.authenticate_additional_data(MAGIC)
        with Path(target).open("xb") as writer:
            os.chmod(target, 0o600)
            while remaining:
                chunk = reader.read(min(CHUNK, remaining))
                if not chunk:
                    raise ValueError("Truncated backup ciphertext.")
                remaining -= len(chunk)
                writer.write(decryptor.update(chunk))
            writer.write(decryptor.finalize())


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as reader:
        while chunk := reader.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def executable(name, pg_bin=None):
    candidate = (
        Path(pg_bin) / (name + (".exe" if os.name == "nt" else ""))
        if pg_bin
        else shutil.which(name)
    )
    if not candidate or not Path(candidate).is_file():
        raise ValueError(f"{name} is required.")
    return str(candidate)


def run(command, *, env=None, timeout=300):
    result = subprocess.run(command, env=env, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(
            f"{Path(command[0]).name} failed; sensitive diagnostics omitted."
        )


def create_backup(
    database, output_root, key_file, *, pg_bin=None, env=None, allow_operational=False
):
    if not TEST_DATABASE.fullmatch(database) and not allow_operational:
        raise ValueError(
            "Explicit operational-backup authorization is required for this database."
        )
    environment = (os.environ if env is None else env).get(
        "BACKUP_ENVIRONMENT", "isolated"
    )
    if environment not in ("isolated", "development", "staging", "production"):
        raise ValueError("Unknown backup environment.")
    if not TEST_DATABASE.fullmatch(database) and environment not in (
        "staging",
        "production",
    ):
        raise ValueError(
            "Operational backups require an explicit staging or production environment."
        )
    output_root = Path(output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = key_from_file(key_file)
    backup_id = (
        datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex
    )
    encrypted = output_root / (backup_id + ".dump.enc")
    manifest = output_root / (backup_id + ".json")
    with tempfile.TemporaryDirectory(
        prefix=".zenvik_backup_", dir=output_root
    ) as folder:
        os.chmod(folder, 0o700)
        dump = Path(folder) / "backup.dump"
        run(
            [
                executable("pg_dump", pg_bin),
                "--no-password",
                "--format=custom",
                "--no-owner",
                "--no-privileges",
                "--file",
                str(dump),
                "--dbname",
                database,
            ],
            env=env,
        )
        if not dump.is_file() or dump.stat().st_size == 0:
            raise RuntimeError("Empty backup.")
        encrypt(dump, encrypted, key)
    document = {
        "environment": environment,
        "database_fingerprint": hashlib.sha256(database.encode()).hexdigest(),
        "format": "zenvik-aes256-gcm-v1",
        "backup_id": backup_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "file": encrypted.name,
        "sha256": sha256(encrypted),
        "bytes": encrypted.stat().st_size,
        "restore_verified": False,
    }
    with manifest.open("x", encoding="utf-8") as writer:
        os.chmod(manifest, 0o600)
        json.dump(document, writer, indent=2)
    return manifest


def restore_new(manifest, key_file, *, pg_bin=None, env=None):
    """Create target itself; caller receives the new name for validation and cleanup."""
    import psycopg
    from psycopg import sql

    env = dict(os.environ if env is None else env)
    manifest = Path(manifest).resolve()
    document = json.loads(manifest.read_text(encoding="utf-8"))
    name = document.get("file")
    if (
        not isinstance(name, str)
        or Path(name).name != name
        or "/" in name
        or "\\" in name
    ):
        raise ValueError("Backup file must be a local basename.")
    candidate = manifest.parent / name
    if candidate.is_symlink():
        raise ValueError("Backup symlinks are not accepted.")
    encrypted = candidate.resolve()
    if (
        encrypted.parent != manifest.parent
        or encrypted.is_symlink()
        or sha256(encrypted) != document["sha256"]
    ):
        raise ValueError("Backup checksum/path verification failed.")
    key = key_from_file(key_file)
    target = "zenvik_restore_dst_" + uuid.uuid4().hex
    maintenance = {
        "host": env.get("PGHOST"),
        "port": env.get("PGPORT", "5432"),
        "user": env.get("PGUSER"),
        "password": env.get("PGPASSWORD"),
        "dbname": env.get("PGDATABASE", "postgres"),
        "connect_timeout": 5,
        "sslmode": env.get("PGSSLMODE", "verify-full"),
    }
    if env.get("PGPASSFILE"):
        maintenance["passfile"] = env["PGPASSFILE"]
    if env.get("PGSSLROOTCERT"):
        maintenance["sslrootcert"] = env["PGSSLROOTCERT"]
    with tempfile.TemporaryDirectory(
        prefix=".zenvik_restore_", dir=manifest.parent
    ) as folder:
        os.chmod(folder, 0o700)
        dump = Path(folder) / "verified.dump"
        decrypt(
            encrypted, dump, key
        )  # Authentication completes before any database write.
        with psycopg.connect(**maintenance, autocommit=True) as admin:
            admin.execute(
                sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
                    sql.Identifier(target)
                )
            )
        try:
            run(
                [
                    executable("pg_restore", pg_bin),
                    "--no-password",
                    "--exit-on-error",
                    "--single-transaction",
                    "--no-owner",
                    "--no-privileges",
                    "--dbname",
                    target,
                    str(dump),
                ],
                env=env,
            )
        except Exception:
            # Target remains for restricted incident inspection; never overwrite/drop existing data.
            raise RuntimeError(
                "Restore failed in a newly created UUID database; inspect isolated targets."
            ) from None
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--database", required=True)
    create.add_argument("--output-root", type=Path, required=True)
    create.add_argument("--key-file", type=Path, required=True)
    create.add_argument("--pg-bin", type=Path)
    create.add_argument("--allow-operational-backup", action="store_true")
    restore = commands.add_parser("restore-new")
    restore.add_argument("--manifest", type=Path, required=True)
    restore.add_argument("--key-file", type=Path, required=True)
    restore.add_argument("--pg-bin", type=Path)
    args = parser.parse_args()
    if args.command == "create":
        result = create_backup(
            args.database,
            args.output_root,
            args.key_file,
            pg_bin=args.pg_bin,
            allow_operational=args.allow_operational_backup,
        )
        print(
            json.dumps(
                {
                    "event": "backup_encrypted",
                    "manifest": result.name,
                    "restore_verified": False,
                }
            )
        )
    else:
        result = restore_new(args.manifest, args.key_file, pg_bin=args.pg_bin)
        print(
            json.dumps(
                {
                    "event": "restore_created",
                    "isolated_database": result,
                    "validated": False,
                }
            )
        )


if __name__ == "__main__":
    main()
