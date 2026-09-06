"""End-to-end proctored sandbox flow: config validation, gating, lifecycle, evaluation."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.v1.postings import _default_sandbox_config
from app.core.config import Settings
from app.services import sandbox as sandbox_service

ADMIN = {"X-Development-Identity": "sandbox-admin"}
CANDIDATE = {"X-Development-Identity": "sandbox-candidate"}

SANDBOX_CODING = {"type": "coding", "difficulty": "easy", "time_limit_minutes": 30}
SANDBOX_SHORT = {"type": "coding", "difficulty": "medium", "time_limit_minutes": 5}


def _sb(attempt_id: str, suffix: str = "") -> str:
    return f"/api/v1/candidates/me/applied-interviews/{attempt_id}/sandbox{suffix}"


def _create_org_and_workflow(client: TestClient) -> None:
    assert (
        client.post(
            "/api/v1/organizations",
            headers=ADMIN,
            json={"name": "Sandbox University", "idempotency_key": "sb-org"},
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/organizations/current/domain-packs/activations",
            headers=ADMIN,
            json={"pack_id": "education"},
        ).status_code
        == 201
    )
    assert client.post("/api/v1/workflows", headers=ADMIN, json={}).status_code == 201


def _create_posting(client: TestClient, key: str, **overrides) -> dict:
    payload = {
        "title": "Assistant Professor",
        "pack_id": "education",
        "idempotency_key": key,
    }
    payload.update(overrides)
    response = client.post("/api/v1/postings", headers=ADMIN, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["posting"]


def _publish_posting(client: TestClient, posting_id: str) -> None:
    assert (
        client.post(
            f"/api/v1/postings/{posting_id}/question-pool/generate", headers=ADMIN
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/postings/{posting_id}/question-pool/lock", headers=ADMIN
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/v1/postings/{posting_id}/publish", headers=ADMIN).status_code
        == 200
    )


def _invite_attempt(client: TestClient, posting_id: str, key_prefix: str = "sb") -> str:
    applied = client.post(
        "/api/v1/applications",
        headers=CANDIDATE,
        json={"posting_id": posting_id, "idempotency_key": f"{key_prefix}-apply"},
    )
    assert applied.status_code == 201, applied.text
    application_id = applied.json()["application"]["id"]
    invite = client.post(
        f"/api/v1/applications/{application_id}/applied-interview-invitations",
        headers=ADMIN,
        json={"idempotency_key": f"{key_prefix}-invite"},
    )
    assert invite.status_code == 201, invite.text
    return invite.json()["attempt"]["id"]


def _submit_attempt(client: TestClient, attempt_id: str, key_prefix: str = "sb") -> None:
    attempt = client.get(
        f"/api/v1/candidates/me/applied-interviews/{attempt_id}", headers=CANDIDATE
    ).json()["attempt"]
    responses = {
        question["id"]: "A thoughtful, complete answer with concrete examples."
        for question in attempt["questions"]
    }
    assert (
        client.patch(
            f"/api/v1/candidates/me/applied-interviews/{attempt_id}/responses",
            headers=CANDIDATE,
            json={"responses": responses},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/candidates/me/applied-interviews/{attempt_id}/submit",
            headers=CANDIDATE,
            json={"idempotency_key": f"{key_prefix}-submit"},
        ).status_code
        == 200
    )


def _ready_attempt(client: TestClient, sandbox: dict, key_prefix: str = "sb") -> str:
    """Posting with the sandbox, published; candidate applied and interview submitted."""
    _create_org_and_workflow(client)
    posting = _create_posting(
        client, f"{key_prefix}-post", sandbox_required=True, sandbox=sandbox
    )
    _publish_posting(client, posting["id"])
    attempt_id = _invite_attempt(client, posting["id"], key_prefix)
    _submit_attempt(client, attempt_id, key_prefix)
    return attempt_id


def test_default_sandbox_config_infers_type_from_pack() -> None:
    assert _default_sandbox_config("software-engineering")["type"] == "coding"
    assert _default_sandbox_config("education")["type"] == "written"
    assert _default_sandbox_config(None)["type"] == "written"
    assert _default_sandbox_config("education")["difficulty"] == "medium"
    assert _default_sandbox_config("education")["time_limit_minutes"] == 30


def test_posting_sandbox_defaults_and_validation(client: TestClient) -> None:
    _create_org_and_workflow(client)

    # Requiring the sandbox without a config stores the inferred defaults.
    defaulted = _create_posting(client, "sb-default", sandbox_required=True)
    assert defaulted["sandbox_required"] is True
    assert defaulted["sandbox"] == {
        "type": "written",
        "difficulty": "medium",
        "time_limit_minutes": 30,
    }

    # An explicit config is stored verbatim.
    custom = _create_posting(
        client,
        "sb-custom",
        sandbox_required=True,
        sandbox={"type": "written", "difficulty": "hard", "time_limit_minutes": 45},
    )
    assert custom["sandbox"] == {
        "type": "written",
        "difficulty": "hard",
        "time_limit_minutes": 45,
    }

    # Invalid configs are rejected at the schema boundary.
    for bad in (
        {"type": "coding", "time_limit_minutes": 3},
        {"type": "video", "time_limit_minutes": 30},
        {"type": "coding", "difficulty": "impossible"},
    ):
        response = client.post(
            "/api/v1/postings",
            headers=ADMIN,
            json={
                "title": "Bad Sandbox Job",
                "pack_id": "education",
                "sandbox_required": True,
                "sandbox": bad,
                "idempotency_key": f"sb-bad-{bad.get('type')}-{bad.get('difficulty')}",
            },
        )
        assert response.status_code == 422

    # Editable while the posting is a draft …
    patched = client.patch(
        f"/api/v1/postings/{defaulted['id']}",
        headers=ADMIN,
        json={"sandbox": {"type": "written", "difficulty": "easy", "time_limit_minutes": 15}},
    )
    assert patched.status_code == 200
    assert patched.json()["posting"]["sandbox"]["time_limit_minutes"] == 15

    # … locked once published.
    _publish_posting(client, defaulted["id"])
    locked = client.patch(
        f"/api/v1/postings/{defaulted['id']}",
        headers=ADMIN,
        json={"sandbox_required": False},
    )
    assert locked.status_code == 409
    assert locked.json()["error"]["code"] == "posting_not_editable"


def test_sandbox_start_gating(client: TestClient) -> None:
    _create_org_and_workflow(client)
    posting = _create_posting(
        client, "sb-gate", sandbox_required=True, sandbox=SANDBOX_CODING
    )
    _publish_posting(client, posting["id"])

    # The voice interview must be submitted before the sandbox opens.
    open_attempt = _invite_attempt(client, posting["id"], "sb-gate")
    early = client.post(_sb(open_attempt, "/start"), headers=CANDIDATE)
    assert early.status_code == 409
    assert early.json()["error"]["code"] == "interview_not_completed"

    # Foreign or missing attempt ids are invisible (404), never 403.
    stranger = client.post(_sb("aia_missing", "/start"), headers=CANDIDATE)
    assert stranger.status_code == 404

    # A posting without the sandbox has no sandbox to start.
    plain = _create_posting(client, "sb-plain")
    _publish_posting(client, plain["id"])
    plain_attempt = _invite_attempt(client, plain["id"], "sb-plain")
    _submit_attempt(client, plain_attempt, "sb-plain")
    denied = client.post(_sb(plain_attempt, "/start"), headers=CANDIDATE)
    assert denied.status_code == 404
    assert denied.json()["error"]["code"] == "sandbox_not_required"


def test_sandbox_start_generates_content_and_resumes(client: TestClient) -> None:
    attempt_id = _ready_attempt(
        client, {"type": "written", "difficulty": "medium", "time_limit_minutes": 30}
    )

    start = client.post(_sb(attempt_id, "/start"), headers=CANDIDATE)
    assert start.status_code == 200
    session = start.json()["session"]
    assert session["status"] == "in_progress"
    assert session["type"] == "written"
    exercise = session["exercise"]
    assert len(exercise["prompts"]) >= 2
    # Grading internals are never exposed to the candidate.
    assert "rubric" not in exercise
    deadline = datetime.fromisoformat(session["deadline"])
    assert deadline > datetime.now(UTC) + timedelta(minutes=25)

    # Restarting is an idempotent resume: same content, same deadline.
    resumed = client.post(_sb(attempt_id, "/start"), headers=CANDIDATE).json()["session"]
    assert resumed["deadline"] == session["deadline"]
    assert resumed["exercise"]["prompts"] == exercise["prompts"]

    # GET reflects the same sanitized session.
    state = client.get(_sb(attempt_id), headers=CANDIDATE).json()
    assert state["required"] is True
    assert state["config"]["type"] == "written"
    assert state["session"]["status"] == "in_progress"
    assert "rubric" not in state["session"]["exercise"]


def test_sandbox_progress_and_submit_are_safe(client: TestClient) -> None:
    attempt_id = _ready_attempt(client, SANDBOX_CODING)

    session = client.post(_sb(attempt_id, "/start"), headers=CANDIDATE).json()["session"]
    assert session["problem"]["starter_code"]
    assert "rubric" not in session["problem"]
    assert session["submission"]["language"] == "python"

    code = "def pair_sum(nums: list[int], target: int) -> list[int]:\n    return [0, 1]\n"
    saved = client.put(
        _sb(attempt_id, "/progress"),
        headers=CANDIDATE,
        json={"code": code, "language": "python"},
    )
    assert saved.status_code == 200
    assert saved.json()["deadline"] == session["deadline"]

    persisted = client.get(_sb(attempt_id), headers=CANDIDATE).json()["session"]
    assert persisted["submission"]["code"] == code

    submitted = client.post(
        _sb(attempt_id, "/submit"),
        headers=CANDIDATE,
        json={"auto": False, "code": code},
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"
    score = submitted.json()["score"]
    assert score is not None and 0 <= score <= 100

    # Submitting is idempotent.
    again = client.post(_sb(attempt_id, "/submit"), headers=CANDIDATE, json={"auto": True})
    assert again.status_code == 200
    assert again.json() == submitted.json()

    # Progress writes are refused once the sandbox is closed.
    closed = client.put(_sb(attempt_id, "/progress"), headers=CANDIDATE, json={"code": "x"})
    assert closed.status_code == 409
    assert closed.json()["error"]["code"] == "sandbox_closed"

    # The candidate-facing session exposes only the score, not eval internals.
    final = client.get(_sb(attempt_id), headers=CANDIDATE).json()["session"]
    assert final["status"] == "submitted"
    assert set(final["evaluation"].keys()) == {"score"}


def test_sandbox_violations_burst_dedup(client: TestClient) -> None:
    attempt_id = _ready_attempt(client, SANDBOX_CODING)
    client.post(_sb(attempt_id, "/start"), headers=CANDIDATE)

    first = client.post(
        _sb(attempt_id, "/violations"),
        headers=CANDIDATE,
        json={"type": "tab_switch", "detail": "document hidden"},
    )
    assert first.status_code == 200
    assert first.json() == {"violations": 1, "deduplicated": False}

    # The same violation type inside one second is a duplicate, not a new entry.
    burst = client.post(
        _sb(attempt_id, "/violations"),
        headers=CANDIDATE,
        json={"type": "tab_switch", "detail": "document hidden again"},
    )
    assert burst.json() == {"violations": 1, "deduplicated": True}

    other = client.post(
        _sb(attempt_id, "/violations"),
        headers=CANDIDATE,
        json={"type": "window_blur"},
    )
    assert other.json() == {"violations": 2, "deduplicated": False}

    session = client.get(_sb(attempt_id), headers=CANDIDATE).json()["session"]
    assert [v["type"] for v in session["violations"]] == ["tab_switch", "window_blur"]


def test_sandbox_deadline_expires_progress_writes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    attempt_id = _ready_attempt(client, SANDBOX_SHORT)
    client.post(_sb(attempt_id, "/start"), headers=CANDIDATE)

    # Jump past the 5-minute deadline plus the 30-second submit grace.
    real_now = datetime.now(UTC)
    monkeypatch.setattr(
        sandbox_service, "_now", lambda: real_now + timedelta(minutes=6)
    )
    expired = client.put(
        _sb(attempt_id, "/progress"), headers=CANDIDATE, json={"code": "x = 1"}
    )
    assert expired.status_code == 409
    assert expired.json()["error"]["code"] == "sandbox_closed"

    session = client.get(_sb(attempt_id), headers=CANDIDATE).json()["session"]
    assert session["status"] == "expired"


def test_sandbox_auto_submit_after_deadline_is_expired_and_evaluated(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    attempt_id = _ready_attempt(client, SANDBOX_SHORT)
    client.post(_sb(attempt_id, "/start"), headers=CANDIDATE)

    real_now = datetime.now(UTC)
    monkeypatch.setattr(
        sandbox_service, "_now", lambda: real_now + timedelta(minutes=6)
    )
    submitted = client.post(
        _sb(attempt_id, "/submit"),
        headers=CANDIDATE,
        json={"auto": True, "code": "print('late but stored')\n"},
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "expired"
    assert submitted.json()["score"] is not None

    # The final snapshot and evaluation survive the deadline.
    session = client.get(_sb(attempt_id), headers=CANDIDATE).json()["session"]
    assert session["status"] == "expired"
    assert "late but stored" in session["submission"]["code"]
    assert set(session["evaluation"].keys()) == {"score"}


def test_sandbox_recording_upload_stores_path(
    client: TestClient, settings: Settings
) -> None:
    attempt_id = _ready_attempt(client, SANDBOX_CODING)
    client.post(_sb(attempt_id, "/start"), headers=CANDIDATE)

    upload = client.post(
        _sb(attempt_id, "/recording"),
        headers=CANDIDATE,
        files={"file": ("sandbox.webm", b"fake-webm-bytes", "video/webm")},
    )
    assert upload.status_code == 200
    expected_name = f"sandbox_{attempt_id}.webm"
    assert upload.json()["recording_path"] == expected_name
    stored = Path(settings.videos_dir) / expected_name
    assert stored.read_bytes() == b"fake-webm-bytes"

    session = client.get(_sb(attempt_id), headers=CANDIDATE).json()["session"]
    assert session["recording_path"] == expected_name

    # Empty uploads are refused.
    empty = client.post(
        _sb(attempt_id, "/recording"),
        headers=CANDIDATE,
        files={"file": ("sandbox.webm", b"", "video/webm")},
    )
    assert empty.status_code == 422
    assert empty.json()["error"]["code"] == "empty_recording"
