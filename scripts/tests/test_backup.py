import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backup import create_backup, decrypt, encrypt, restore_new, sha256


class EncryptedBackupTests(unittest.TestCase):
    def test_authenticated_encryption_roundtrip_and_random_nonce(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "synthetic.dump"
            source.write_bytes(b"synthetic test fixture" * 10000)
            key = secrets.token_bytes(32)
            encrypt(source, root / "one.enc", key)
            encrypt(source, root / "two.enc", key)
            self.assertNotEqual(
                (root / "one.enc").read_bytes(), (root / "two.enc").read_bytes()
            )
            self.assertNotIn(b"synthetic test fixture", (root / "one.enc").read_bytes())
            decrypt(root / "one.enc", root / "restored.dump", key)
            self.assertEqual(source.read_bytes(), (root / "restored.dump").read_bytes())

    def test_wrong_key_and_modified_ciphertext_fail_before_database_access(self):
        from cryptography.exceptions import InvalidTag

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "source.dump").write_bytes(b"synthetic evidence")
            key = secrets.token_bytes(32)
            (root / "key").write_bytes(secrets.token_bytes(32))
            encrypt(root / "source.dump", root / "test.enc", key)
            manifest = {"file": "test.enc", "sha256": sha256(root / "test.enc")}
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch("psycopg.connect") as connect, self.assertRaises(InvalidTag):
                restore_new(root / "manifest.json", root / "key")
            connect.assert_not_called()
            payload = bytearray((root / "test.enc").read_bytes())
            payload[-17] ^= 1
            (root / "test.enc").write_bytes(payload)
            (root / "key").write_bytes(key)
            manifest["sha256"] = sha256(root / "test.enc")
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch("psycopg.connect") as connect, self.assertRaises(InvalidTag):
                restore_new(root / "manifest.json", root / "key")
            connect.assert_not_called()

    def test_requires_explicit_authorization_for_operational_backup(self):
        with patch("subprocess.run") as run, self.assertRaises(ValueError):
            create_backup("operational_database", "/unused", "/unused")
        run.assert_not_called()

    def test_manifest_path_cannot_escape_protected_backup_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "manifest.json").write_text(
                json.dumps({"file": "../outside.enc", "sha256": "bad"}),
                encoding="utf-8",
            )
            with patch("psycopg.connect") as connect, self.assertRaises(ValueError):
                restore_new(root / "manifest.json", root / "unused-key")
            connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
