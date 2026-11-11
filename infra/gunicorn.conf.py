"""Bounds are initial operational settings, not measured capacity promises."""

import os

bind = "0.0.0.0:8000"
workers = int(os.environ.get("WEB_CONCURRENCY", "2"))
worker_class = "gthread"
threads = int(os.environ.get("WEB_THREADS", "4"))
timeout = 30
graceful_timeout = 30
keepalive = 2
max_requests = 1000
max_requests_jitter = 100
worker_tmp_dir = "/tmp"
accesslog = None  # API middleware emits bounded events without URL/query/IP.
errorlog = "-"
forwarded_allow_ips = ""  # Django independently checks the actual network peer.
secure_scheme_headers = {}
logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"safe": {"()": "config.observability.SafeJSONFormatter"}},
    "handlers": {"safe": {"class": "logging.StreamHandler", "formatter": "safe"}},
    "root": {"handlers": ["safe"], "level": "INFO"},
    "loggers": {
        "gunicorn.error": {"handlers": ["safe"], "level": "INFO", "propagate": False},
        "gunicorn.access": {
            "handlers": ["safe"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}
