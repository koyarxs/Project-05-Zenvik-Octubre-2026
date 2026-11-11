"""Run newly built images without networking/ports/data; always remove own UUID containers."""

import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docker", default=shutil.which("docker"))
    parser.add_argument("--api-image", default="zenvik-api:stage16")
    parser.add_argument("--web-image", default="zenvik-web:stage16")
    args = parser.parse_args()
    if not args.docker:
        raise SystemExit("Docker executable required.")
    child_env = {
        **os.environ,
        "DJANGO_READ_DOTENV": "False",
        "DJANGO_PRODUCTION": "False",
        "DEBUG": "False",
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "ALLOWED_HOSTS": "localhost,127.0.0.1",
        "TURNSTILE_ENABLED": "False",
        "BILLING_PAYMENT_MODE": "disabled",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "unreachable_synthetic",
        "POSTGRES_USER": "synthetic",
        "POSTGRES_PASSWORD": secrets.token_urlsafe(32),
        "POSTGRES_CONNECT_TIMEOUT": "1",
    }
    report = {"network": "none", "ports_published": False, "services": {}}

    def call(arguments, timeout=60, required=True):
        result = subprocess.run(
            [args.docker, *arguments],
            env=child_env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if required and result.returncode:
            raise RuntimeError(
                "Container smoke operation failed; sensitive diagnostics omitted."
            )
        return result

    for service, image in [("api", args.api_image), ("web", args.web_image)]:
        user = call(
            ["image", "inspect", image, "--format", "{{.Config.User}}"]
        ).stdout.strip()
        if user in ("", "0", "root", "0:0"):
            raise RuntimeError("Runtime image must use a non-root user.")
        name = "zenvik16_smoke_" + uuid.uuid4().hex
        environment = []
        if service == "api":
            for key in child_env:
                if key.startswith(("DJANGO_", "POSTGRES_")) or key in (
                    "DEBUG",
                    "ALLOWED_HOSTS",
                    "TURNSTILE_ENABLED",
                    "BILLING_PAYMENT_MODE",
                ):
                    environment.extend(["-e", key])
            probes = [
                "python",
                "-c",
                "import urllib.request,urllib.error,json; r=urllib.request.urlopen('http://127.0.0.1:8000/health/live/',timeout=3); print(r.status)",
            ]
            unavailable = [
                "python",
                "-c",
                "import urllib.request,urllib.error;\ntry: urllib.request.urlopen('http://127.0.0.1:8000/health/ready/',timeout=4)\nexcept urllib.error.HTTPError as e: print(e.code)",
            ]
        else:
            environment = [
                "-e",
                "APP_ORIGIN=https://staging.example.invalid",
                "-e",
                "DJANGO_API_URL=http://127.0.0.1:8000",
            ]
            probes = [
                "node",
                "-e",
                "fetch('http://127.0.0.1:3000/health/live').then(r=>console.log(r.status)).catch(()=>process.exit(1))",
            ]
            unavailable = [
                "node",
                "-e",
                "fetch('http://127.0.0.1:3000/health/ready').then(r=>console.log(r.status)).catch(()=>process.exit(1))",
            ]
        created = False
        try:
            call(
                [
                    "run",
                    "-d",
                    "--name",
                    name,
                    "--network",
                    "none",
                    "--read-only",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges:true",
                    "--mount",
                    "type=tmpfs,destination=/tmp,tmpfs-size=67108864,tmpfs-mode=1777",
                    "--tmpfs",
                    "/app/.next/cache:size=128m,uid=1000,gid=1000",
                    *environment,
                    image,
                ]
            )
            created = True
            for _ in range(20):
                response = call(["exec", name, *probes], required=False)
                if response.returncode == 0 and response.stdout.strip() == "200":
                    break
                time.sleep(0.5)
            else:
                logs = call(["logs", name], required=False)
                (
                    ROOT / ".artifacts" / f"stage16-{service}-smoke-failure.log"
                ).write_text(
                    logs.stdout + logs.stderr + response.stdout + response.stderr,
                    encoding="utf-8",
                )
                raise RuntimeError(
                    f"{service} container failed its liveness smoke probe; inspect synthetic diagnostic log."
                )
            response = call(["exec", name, *unavailable])
            if response.stdout.strip() != "503":
                raise RuntimeError(
                    "Readiness must fail when isolated dependencies are unreachable."
                )
            extra_checks = {}
            if service == "web":
                for label, path in [
                    ("login_page", "/iniciar-sesion"),
                    (
                        "image_optimization",
                        "/_next/image?url=%2Fimages%2Fauth-cafe-v1.png&w=640&q=85",
                    ),
                ]:
                    javascript = f"fetch('http://127.0.0.1:3000{path}').then(async r=>{{await r.arrayBuffer();console.log(r.status)}}).catch(()=>process.exit(1))"
                    result = call(["exec", name, "node", "-e", javascript])
                    if result.stdout.strip() != "200":
                        raise RuntimeError(
                            f"Standalone frontend {label} smoke check failed."
                        )
                    extra_checks[label] = 200
            started = time.monotonic()
            call(["stop", "--time", "35", name], timeout=45)
            report["services"][service] = {
                **extra_checks,
                "user": user,
                "liveness": 200,
                "dependency_failure": 503,
                "graceful_stop_seconds": round(time.monotonic() - started, 2),
            }
        finally:
            if created:
                call(["rm", "--force", name], required=False)
    (ROOT / ".artifacts").mkdir(exist_ok=True)
    (ROOT / ".artifacts/stage16-container-smoke.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report))


if __name__ == "__main__":
    main()
