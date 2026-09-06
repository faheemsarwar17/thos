"""End-to-end smoke test against a running local backend.

Usage: python scripts/smoke.py [base_url]
Exercises the seeded demo data through the public API the way the frontend does.
"""

import json
import sys
import urllib.error
import urllib.request
from uuid import uuid4

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
ADMIN = "local-developer"
CANDIDATE = "hira-ahmed"
FRESH_CANDIDATE = f"smoke-candidate-{uuid4().hex[:8]}"

checks: list[tuple[str, bool, str]] = []


def call(method: str, path: str, identity: str | None = None, body: dict | None = None):
    request = urllib.request.Request(f"{BASE}{path}", method=method)
    request.add_header("Content-Type", "application/json")
    if identity:
        request.add_header("X-Development-Identity", identity)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(request, data=data) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"{}")


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{f'  ({detail})' if detail and not ok else ''}")


status, _ = call("GET", "/health/ready")
check("health ready", status == 200, f"status {status}")

status, body = call("GET", "/api/v1/me", ADMIN)
check("employer identity resolves", status == 200 and body["memberships"], f"status {status}")

status, body = call("GET", "/api/v1/postings", ADMIN)
check(
    "employer sees seeded postings",
    status == 200 and len(body["postings"]) >= 1,
    f"status {status}",
)
published = next((p for p in body["postings"] if p["status"] == "published"), None)
check("a published posting exists", published is not None)

status, body = call("GET", "/api/v1/pipeline", ADMIN)
cards = [card for column in body.get("columns", []) for card in column["cards"]]
check("pipeline has seeded applications", status == 200 and len(cards) >= 1, f"status {status}")

status, body = call("GET", "/api/v1/analytics/pipeline", ADMIN)
check("analytics endpoint", status == 200 and "analytics" in body, f"status {status}")

status, body = call("GET", "/api/v1/pipeline", "tariq-mahmood")
other_cards = [card for column in body.get("columns", []) for card in column["cards"]]
overlap = {c["id"] for c in cards} & {c["id"] for c in other_cards}
check("tenant isolation across pipelines", status == 200 and not overlap, f"overlap {overlap}")

status, body = call("GET", "/api/v1/jobs", CANDIDATE)
check("candidate job discovery", status == 200 and len(body["jobs"]) >= 1, f"status {status}")

status, body = call("GET", "/api/v1/candidates/me/profile", FRESH_CANDIDATE)
check("fresh candidate profile auto-created", status == 200, f"status {status}")

status, body = call(
    "PATCH", "/api/v1/candidates/me/profile", FRESH_CANDIDATE,
    {
        "full_name": "Smoke Tester",
        "headline": "Physics teacher",
        "skills": ["physics", "assessment"],
    },
)
check("candidate profile update", status == 200, f"status {status}")

status, body = call(
    "POST", "/api/v1/candidates/me/profile-interview-attempts", FRESH_CANDIDATE,
    {"pack_id": "education"},
)
check("profile interview starts", status in (200, 201), f"status {status}: {body}")
attempt = body.get("attempt", {})
questions = attempt.get("questions", [])
check("interview has questions", len(questions) >= 3, f"{len(questions)} questions")

if attempt:
    responses = {
        q["id"]: "First I would review the curriculum objectives, plan formative assessment, "
                 "differentiate the lesson for mixed abilities, and reflect on outcomes with data."
        for q in questions
    }
    status, _ = call(
        "PATCH", f"/api/v1/profile-interview-attempts/{attempt['id']}/responses",
        FRESH_CANDIDATE, {"responses": responses},
    )
    check("responses autosave", status == 200, f"status {status}")
    status, body = call(
        "POST", f"/api/v1/profile-interview-attempts/{attempt['id']}/submit",
        FRESH_CANDIDATE, {"idempotency_key": uuid4().hex},
    )
    check(
        "submission returns evaluation",
        status == 200 and body.get("evaluation", {}).get("overall_score") is not None,
        f"status {status}: {body}",
    )

if published:
    status, body = call(
        "POST", "/api/v1/applications", FRESH_CANDIDATE,
        {"posting_id": published["id"], "idempotency_key": uuid4().hex},
    )
    check("candidate applies to published job", status in (200, 201), f"status {status}: {body}")
    application_id = body.get("application", {}).get("id")
    if application_id:
        status, body = call(
            "GET", f"/api/v1/candidates/me/applications/{application_id}/timeline", FRESH_CANDIDATE,
        )
        check("candidate timeline", status == 200 and body["timeline"]["steps"], f"status {status}")

status, body = call("GET", "/api/v1/candidates/me/applications", FRESH_CANDIDATE)
check("candidate application list", status == 200, f"status {status}")

status, _ = call("GET", "/api/v1/postings", CANDIDATE)
check("candidate denied employer endpoint", status in (401, 403, 404), f"status {status}")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
sys.exit(1 if failed else 0)
