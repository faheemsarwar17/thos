"""Candidate proctoring API and /voice/start gating (Task 4)."""

import base64
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services import voice_interview as voice
from app.services.synthesis_service import synthesis_service
from tests.proctoring_helpers import (
    CANDIDATE,
    OTHER_CANDIDATE,
    applied_attempt,
    profile_attempt,
)

PROFILE = "/api/v1/candidates/me/profile-interview-attempts/{id}/voice"
APPLIED = "/api/v1/candidates/me/applied-interviews/{id}/voice"
ENVELOPE = {"yaw": [-15, 15], "pitch": [-10, 10], "iris_h": [0.35, 0.65], "iris_v": [0.4, 0.6]}
JPEG_URL = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 64).decode()


@pytest.fixture
def fast_client(settings: Settings, tmp_path, monkeypatch) -> Iterator[TestClient]:
    """No strike cooldown; analysis stubbed (it reads the global DB otherwise)."""
    tuned = settings.model_copy(
        update={"proctoring_strike_cooldown_seconds": 0, "snapshots_dir": str(tmp_path / "snaps")}
    )
    analyzed: list[str] = []

    async def fake_analyze(attempt_id: str) -> bool:
        analyzed.append(attempt_id)
        return True

    monkeypatch.setattr(synthesis_service, "analyze_interview", fake_analyze)
    monkeypatch.setattr(voice, "ensure_voice_ready", lambda settings: None)
    with TestClient(create_app(tuned)) as test_client:
        test_client.analyzed = analyzed  # type: ignore[attr-defined]
        yield test_client


def _setup(client: TestClient, base: str) -> None:
    consent = client.post(
        f"{base}/proctoring/consent",
        headers=CANDIDATE,
        json={
            "accepted": True,
            "signature_name": " Hira Ahmed ",
            "policy_version": "proctoring-v1",
        },
    )
    assert consent.status_code == 200, consent.text
    calibration = client.post(
        f"{base}/proctoring/calibration",
        headers=CANDIDATE,
        json={"envelope": ENVELOPE, "face_presence": 0.92},
    )
    assert calibration.status_code == 200, calibration.text


def _event(client: TestClient, base: str, type_: str = "tab_hidden", **extra):
    return client.post(
        f"{base}/proctoring/events",
        headers=CANDIDATE,
        json={"type": type_, "client_ts": 1_700_000_000_000, **extra},
    )


def test_consent_and_calibration_flags(fast_client: TestClient) -> None:
    base = PROFILE.format(id=profile_attempt(fast_client))
    state = fast_client.get(f"{base}/proctoring", headers=CANDIDATE).json()
    assert state["enabled"] is True
    assert state["consent_required"] is True and state["calibration_required"] is True
    assert state["config"]["sustainedS"] == 10.0
    assert state["warnings_used"] == 0 and state["terminated"] is None
    _setup(fast_client, base)
    state = fast_client.get(f"{base}/proctoring", headers=CANDIDATE).json()
    assert state["consent_required"] is False and state["calibration_required"] is False
    assert state["envelope"] == {
        "yaw": [-15, 15],
        "pitch": [-10, 10],
        "irisH": [0.35, 0.65],
        "irisV": [0.4, 0.6],
    }


def test_consent_and_calibration_validation(fast_client: TestClient) -> None:
    base = PROFILE.format(id=profile_attempt(fast_client))
    for body in (
        {"accepted": False, "signature_name": "Hira", "policy_version": "proctoring-v1"},
        {"accepted": True, "signature_name": "H", "policy_version": "proctoring-v1"},
        {"accepted": True, "signature_name": "Hira", "policy_version": "proctoring-v0"},
    ):
        response = fast_client.post(f"{base}/proctoring/consent", headers=CANDIDATE, json=body)
        assert response.status_code == 422, body
    low = fast_client.post(
        f"{base}/proctoring/calibration",
        headers=CANDIDATE,
        json={"envelope": ENVELOPE, "face_presence": 0.5},
    )
    assert low.status_code == 422 and low.json()["error"]["code"] == "calibration_failed"
    inverted = fast_client.post(
        f"{base}/proctoring/calibration",
        headers=CANDIDATE,
        json={"envelope": {**ENVELOPE, "yaw": [10, -10]}, "face_presence": 0.9},
    )
    assert inverted.status_code == 422


def test_strike_flow_terminates_and_blocks_restart(fast_client: TestClient) -> None:
    attempt_id = profile_attempt(fast_client)
    base = PROFILE.format(id=attempt_id)
    _setup(fast_client, base)

    first = _event(fast_client, base).json()
    assert (first["decision"], first["strike"], first["counted"]) == ("warn", 1, True)
    assert first["message"] == "You left the interview tab."
    pending = _event(fast_client, base, "window_blur").json()
    assert (pending["decision"], pending["counted"]) == ("none", False)
    wrong = fast_client.post(
        f"{base}/proctoring/acknowledge", headers=CANDIDATE, json={"strike": 2}
    )
    assert wrong.status_code == 409
    state = fast_client.get(f"{base}/proctoring", headers=CANDIDATE).json()
    assert state["pending_warning"]["strike"] == 1
    assert (
        fast_client.post(
            f"{base}/proctoring/acknowledge", headers=CANDIDATE, json={"strike": 1}
        ).status_code
        == 200
    )

    second = _event(fast_client, base, "face_missing").json()
    assert (second["decision"], second["strike"]) == ("warn", 2)
    fast_client.post(f"{base}/proctoring/acknowledge", headers=CANDIDATE, json={"strike": 2})
    third = _event(fast_client, base, "gaze_reading_pattern").json()
    assert (third["decision"], third["strike"]) == ("terminate", 3)
    assert fast_client.analyzed == [attempt_id]  # type: ignore[attr-defined]

    session = fast_client.get(base, headers=CANDIDATE).json()
    assert session["status"] == "submitted"
    assert session["proctoring"]["enabled"] is True
    assert len(session["proctoring"]["terminated"]["strikes"]) == 3

    state = fast_client.get(f"{base}/proctoring", headers=CANDIDATE).json()
    assert state["terminated"]["reason_code"] == "gaze_violation"
    assert "events" not in state and "counts" not in state and "outcome" not in state

    restart = fast_client.post(f"{base}/start", headers=CANDIDATE)
    assert restart.status_code == 409
    assert restart.json()["error"]["code"] == "proctoring_terminated"
    after = _event(fast_client, base)
    assert after.status_code == 409 and after.json()["error"]["code"] == "attempt_not_active"


def test_start_requires_consent_and_calibration(fast_client: TestClient) -> None:
    base = PROFILE.format(id=profile_attempt(fast_client))
    response = fast_client.post(f"{base}/start", headers=CANDIDATE)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "proctoring_setup_incomplete"


def test_event_validation(fast_client: TestClient) -> None:
    base = PROFILE.format(id=profile_attempt(fast_client))
    _setup(fast_client, base)
    assert _event(fast_client, base, snapshot=JPEG_URL).status_code == 422  # profile: no snapshots
    assert _event(fast_client, base, "voice_mismatch").status_code == 422  # server-only type
    assert _event(fast_client, base, "detector_heartbeat_lost").status_code == 422
    assert _event(fast_client, base, metrics={"nested": {"a": 1}}).status_code == 422
    assert _event(fast_client, base, metrics={"x": "y" * 201}).status_code == 422
    foreign = fast_client.post(
        f"{base}/proctoring/events",
        headers=OTHER_CANDIDATE,
        json={"type": "tab_hidden", "client_ts": 1},
    )
    assert foreign.status_code == 404
    flag = _event(fast_client, base, "speech_during_ai_turn", metrics={"seconds": 2.1}).json()
    assert (flag["decision"], flag["counted"]) == ("none", False)


def test_heartbeat_returns_candidate_view(fast_client: TestClient) -> None:
    base = PROFILE.format(id=profile_attempt(fast_client))
    _setup(fast_client, base)
    body = fast_client.post(
        f"{base}/proctoring/heartbeat",
        headers=CANDIDATE,
        json={"client_ts": 1, "fps": 12, "face_present": True},
    ).json()
    assert body == {"ok": True, "pending_warning": None, "terminated": None}


def test_applied_snapshot_is_stored(fast_client: TestClient, monkeypatch) -> None:
    started: list[str] = []

    async def fake_start(**kwargs) -> None:
        started.append(kwargs["session_id"])

    monkeypatch.setattr(voice, "start_voice_session", fake_start)
    _, attempt_id = applied_attempt(fast_client)
    base = APPLIED.format(id=attempt_id)
    _setup(fast_client, base)
    assert fast_client.post(f"{base}/start", headers=CANDIDATE).status_code == 200
    decision = _event(fast_client, base, snapshot=JPEG_URL)
    assert decision.status_code == 200, decision.text
    assert decision.json()["decision"] == "warn"


def test_proctoring_off_job_runs_without_consent(fast_client: TestClient, monkeypatch) -> None:
    started: list[str] = []

    async def fake_start(**kwargs) -> None:
        started.append(kwargs["session_id"])

    monkeypatch.setattr(voice, "start_voice_session", fake_start)
    _, attempt_id = applied_attempt(fast_client, proctoring_enabled=False)
    base = APPLIED.format(id=attempt_id)
    state = fast_client.get(f"{base}/proctoring", headers=CANDIDATE).json()
    assert state["enabled"] is False
    assert state["consent_required"] is False and state["calibration_required"] is False
    assert fast_client.get(base, headers=CANDIDATE).json()["proctoring"]["enabled"] is False
    response = fast_client.post(f"{base}/start", headers=CANDIDATE)
    assert response.status_code == 200, response.text
    assert started == [attempt_id]
    event = _event(fast_client, base)
    assert event.status_code == 409 and event.json()["error"]["code"] == "proctoring_disabled"


def test_enrolment_route_is_registered(fast_client: TestClient) -> None:
    base = PROFILE.format(id=profile_attempt(fast_client))
    response = fast_client.post(
        f"{base}/proctoring/enrolment",
        headers=CANDIDATE,
        files={"file": ("sample.wav", b"RIFF0000WAVE", "audio/wav")},
    )
    assert response.status_code in (200, 422)
