"""Small real-HTTP workload in the runner's UUID test database, never production."""

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import statistics
import platform
import time
from urllib.request import Request, urlopen

from django.contrib.auth import get_user_model
from django.test import Client, LiveServerTestCase

from businesses.models import Business, Employee, Membership


class LocalPerformanceTests(LiveServerTestCase):
    host = "127.0.0.1"

    def test_bounded_dashboard_workload(self):
        user = get_user_model().objects.create_user(
            username="load_synthetic", email="load@example.test"
        )
        business = Business.objects.create(name="Synthetic load fixture")
        Membership.objects.create(user=user, business=business, role="OWNER")
        for number in range(10):
            Employee.objects.create(
                business=business, first_name="Synthetic", last_name=str(number)
            )
        client = Client()
        client.force_login(user)
        cookie = "; ".join(
            f"{key}={value.value}" for key, value in client.cookies.items()
        )
        target = f"{self.live_server_url}/api/v1/businesses/{business.pk}/dashboard/"

        def fetch(_):
            start = time.monotonic()
            with urlopen(
                Request(target, headers={"Cookie": cookie}), timeout=10
            ) as response:
                status = response.status
                payload = json.load(response)
            return (
                (time.monotonic() - start) * 1000,
                status,
                payload["active_employees"],
            )

        start = time.monotonic()
        with ThreadPoolExecutor(max_workers=4) as executor:
            samples = list(executor.map(fetch, range(80)))
        latency = sorted(row[0] for row in samples)
        self.assertTrue(
            all(status == 200 and count == 10 for _, status, count in samples)
        )
        report = {
            "python": platform.python_version(),
            "platform": platform.system(),
            "synthetic": True,
            "requests": 80,
            "concurrency": 4,
            "errors": 0,
            "p50_ms": round(statistics.median(latency), 2),
            "p95_ms": round(latency[int(len(latency) * 0.95) - 1], 2),
            "max_ms": round(max(latency), 2),
            "duration_seconds": round(time.monotonic() - start, 2),
            "capacity_claim": False,
            "transport": "local HTTP; no real TLS",
        }
        root = Path(__file__).resolve().parents[3]
        (root / ".artifacts").mkdir(exist_ok=True)
        (root / ".artifacts/stage16-local-load.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )
