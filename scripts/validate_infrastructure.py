"""Offline checks of CI/release policy and prepared Compose syntax (not a remote run)."""

import json
from pathlib import Path
import re
import yaml

ROOT = Path(__file__).resolve().parents[1]
issues = []


def check(condition, description):
    if not condition:
        issues.append(description)


workflow = yaml.safe_load(
    (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8"),
)
check(
    workflow.get("permissions") == {"contents": "read"},
    "CI token must remain read-only.",
)
check(
    set(workflow.get("jobs", {})) == {"application", "containers"},
    "Unexpected CI job; review release policy.",
)
for job in workflow.get("jobs", {}).values():
    for step in job.get("steps", []):
        if "uses" in step:
            check(
                bool(re.fullmatch(r"actions/[a-z-]+@[a-f0-9]{40}", step["uses"])),
                "Actions must use reviewed immutable commits.",
            )
        run = step.get("run", "")
        check(
            not re.search(
                r"(?m)^\s*(?:terraform\s+apply|kubectl|docker\s+(?:push|compose\s+up)|gcloud\s+run\s+deploy)",
                run,
            ),
            "CI must not deploy or publish artifacts.",
        )
compose = yaml.safe_load(
    (ROOT / "infra/compose.staging.yml").read_text(encoding="utf-8"),
)
check(
    "ports" not in compose["services"]["api"],
    "Prepared API must not publish a host port.",
)
check(
    "db" not in compose["services"],
    "Managed PostgreSQL is external/private, not publicly published by this stack.",
)
for name in ("api", "web"):
    check(
        compose["services"][name].get("read_only") is True,
        f"{name} runtime must use a read-only root filesystem.",
    )
    check(
        "ALL" in compose["services"][name].get("cap_drop", []),
        f"{name} capabilities must be dropped.",
    )
for path in ("apps/api/Dockerfile", "apps/web/Dockerfile"):
    source = (ROOT / path).read_text(encoding="utf-8")
    check(
        bool(re.search(r"@sha256:[a-f0-9]{64}", source)),
        f"{path} needs a reviewed base digest.",
    )
    check(
        "HEALTHCHECK" in source and "USER " in source,
        f"{path} needs runtime user and healthcheck.",
    )
ignore = (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
for pattern in (
    ".git",
    ".env",
    ".artifacts",
    ".aws",
    "**/node_modules",
    "**/.venv",
    "**/*.key",
):
    check(pattern in ignore, f"Build context must exclude {pattern}.")
report = {
    "offline_static_validation": True,
    "remote_ci_run": False,
    "deployment_performed": False,
    "issues": issues,
    "passed": not issues,
}
(ROOT / ".artifacts").mkdir(exist_ok=True)
(ROOT / ".artifacts/stage16-infrastructure-validation.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
print(json.dumps(report))
raise SystemExit(1 if issues else 0)
