"""Bounded local scheduler entry point; never migrates or changes attendance facts."""
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    log_dir = ROOT / '.artifacts'
    log_dir.mkdir(exist_ok=True)
    logger = logging.getLogger('attendance-alerts')
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(log_dir / 'attendance-alerts.log', maxBytes=1_000_000, backupCount=3, encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
    logger.addHandler(handler)
    env = {**os.environ, 'PGCONNECT_TIMEOUT': '5'}
    try:
        result = subprocess.run(
            [sys.executable, str(ROOT / 'apps/api/manage.py'), 'scan_attendance_alerts'],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=240,
        )
        if result.returncode:
            # Do not copy database diagnostics or connection details into a recurring log.
            logger.error('Scan failed (exit %s). Check database connectivity and migrations.', result.returncode)
            return result.returncode
        logger.info('Scan completed: %s', result.stdout.strip())
        return 0
    except subprocess.TimeoutExpired:
        logger.error('Scan exceeded 240 seconds; child terminated. Next scheduled run will retry.')
        return 1
    except OSError:
        logger.exception('Unable to launch attendance scanner')
        return 1
    finally:
        handler.close()
        logger.removeHandler(handler)


if __name__ == '__main__':
    raise SystemExit(main())
