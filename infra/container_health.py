"""Readiness probe with a configured allowed Host, never a secret in arguments."""

import os
import sys
from urllib.request import Request, urlopen

request = Request(
    "http://127.0.0.1:8000/health/ready/",
    headers={"Host": os.environ.get("HEALTHCHECK_HOST", "localhost")},
)
try:
    with urlopen(request, timeout=4) as response:
        sys.exit(0 if response.status == 200 else 1)
except OSError:
    sys.exit(1)
