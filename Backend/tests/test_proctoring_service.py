"""Proctoring service: atomic mutate, snapshots, purge, decision dispatch (Task 3)."""

import asyncio
import base64
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db import store
from app.db.database import connect
from app.proctoring import policy, service
from tests.proctoring_helpers import applied_attempt, profile_attempt

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"
JPEG_URL = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
EVENT_ID = "pev_0123456789abcdef"


@pytest.fixture
def snap_settings(settings: Settings, tmp_path: Path) -> Settings:
    return settings.model_copy(update={"snapshots_dir": str(tmp_path / "snapshots")})


def test_mutate_creates_and_persists_for_both_kinds(client: TestClient, settings: Settings) -> None:
    _, applied_id = applied_attempt(client)
    profile_id = profile_attempt(client)
    conn = connect(settings.database)
    try:
        for kind, attempt_id in (("applied", applied_id), ("profile", profile_id)):
            record, result = service.mutate(
                conn, kind=kind, attempt_id=attempt_id, fn=lambda r: r.update(strikes=1) or "ok"
            )
            conn.commit()
            assert result == "ok" and record["enabled"] is False and record["kind"] == kind
            record, _ = service.mutate(
                conn,
                kind=kind,
                attempt_id=attempt_id,
                fn=lambda r: r.update(strikes=r["strikes"] + 1),
            )
            conn.commit()
            stored = store.get_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id)
            assert stored["strikes"] == 2
    finally:
        conn.close()


def test_ensure_record_freezes_enabled_at_first_start(
    client: TestClient, settings: Settings
) -> None:
    _, attempt_id = applied_attempt(client)
    conn = connect(settings.database)
    now = datetime.now(UTC)
    try:
        record = service.ensure_record(
            conn, kind="applied", attempt_id=attempt_id, enabled=True, now=now
        )
        conn.commit()
        assert record["enabled"] is True and record["started_at_interview"]
        record = service.ensure_record(
            conn, kind="applied", attempt_id=attempt_id, enabled=False, now=now
        )
        conn.commit()
        assert record["enabled"] is True
    finally:
        conn.close()


def test_save_snapshot_validates_and_writes(snap_settings: Settings) -> None:
    name = service.save_snapshot(
        snap_settings, attempt_id="aia_1", event_id=EVENT_ID, data_url=JPEG_URL
    )
    assert name == f"{EVENT_ID}.jpg"
    assert service.read_snapshot(snap_settings, attempt_id="aia_1", file_name=name) == JPEG

    png = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n").decode()
    with pytest.raises(service.SnapshotError):
        service.save_snapshot(snap_settings, attempt_id="aia_1", event_id=EVENT_ID, data_url=png)
    big = "data:image/jpeg;base64," + base64.b64encode(JPEG + b"\x00" * 500_000).decode()
    with pytest.raises(service.SnapshotError):
        service.save_snapshot(snap_settings, attempt_id="aia_1", event_id=EVENT_ID, data_url=big)
    for bad_id in ("../etc", "pev_xyz", "pev_0123456789ABCDEF"):
        with pytest.raises(service.SnapshotError):
            service.save_snapshot(
                snap_settings, attempt_id="aia_1", event_id=bad_id, data_url=JPEG_URL
            )
    with pytest.raises(service.SnapshotError):
        service.save_snapshot(
            snap_settings, attempt_id="../x", event_id=EVENT_ID, data_url=JPEG_URL
        )
    assert service.read_snapshot(snap_settings, attempt_id="aia_1", file_name="../x.jpg") is None

    service.delete_attempt_snapshots(snap_settings, attempt_id="aia_1")
    assert service.read_snapshot(snap_settings, attempt_id="aia_1", file_name=name) is None


def test_purge_expired_snapshots_removes_file_and_flags_event(
    client: TestClient, snap_settings: Settings
) -> None:
    _, attempt_id = applied_attempt(client)
    name = service.save_snapshot(
        snap_settings, attempt_id=attempt_id, event_id=EVENT_ID, data_url=JPEG_URL
    )
    conn = connect(snap_settings.database)
    try:
        service.mutate(
            conn,
            kind="applied",
            attempt_id=attempt_id,
            fn=lambda r: policy.apply_event(
                r,
                type_="tab_hidden",
                now=datetime.now(UTC),
                max_warnings=2,
                cooldown_seconds=20,
                flag_dedup_seconds=30,
                snapshot=name,
                event_id=EVENT_ID,
            ),
        )
        conn.commit()
        path = Path(snap_settings.snapshots_dir) / attempt_id / name
        mtime = datetime.fromtimestamp(os.path.getmtime(path), UTC)
        assert (
            service.purge_expired_snapshots(conn, snap_settings, now=mtime + timedelta(days=179))
            == 0
        )
        assert path.exists()
        removed = service.purge_expired_snapshots(
            conn, snap_settings, now=mtime + timedelta(days=181)
        )
        assert removed == 1 and not path.exists()
        record = store.get_attempt_proctoring(conn, kind="applied", attempt_id=attempt_id)
        event = next(e for e in record["events"] if e["id"] == EVENT_ID)
        assert event["snapshot"] is None and event["snapshot_purged"] is True
    finally:
        conn.close()


def _terminated(conn, kind: str, attempt_id: str) -> tuple[dict, policy.Decision]:
    def fn(r: dict) -> policy.Decision:
        r["enabled"] = True
        decision = None
        for i, seconds in enumerate((0, 30, 60), start=1):
            decision = policy.apply_event(
                r,
                type_="face_missing",
                now=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=seconds),
                max_warnings=2,
                cooldown_seconds=20,
                flag_dedup_seconds=30,
            )
            if i < 3:
                policy.acknowledge(r, strike=i, now=datetime(2026, 1, 1, tzinfo=UTC))
        return decision

    return service.mutate(conn, kind=kind, attempt_id=attempt_id, fn=fn)


def test_dispatch_terminate_without_live_session_submits_and_analyzes(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ai.runtime import manager
    from app.services.synthesis_service import synthesis_service

    profile_id = profile_attempt(client)
    calls: list[str] = []
    sent: list[dict] = []

    async def fake_analyze(attempt_id: str) -> bool:
        calls.append(attempt_id)
        c = connect(settings.database)
        store.update_profile_interview_voice(c, attempt_id=attempt_id, status="evaluated")
        c.commit()
        c.close()
        return True

    async def fake_send(session_id: str, message: dict) -> None:
        sent.append(message)

    monkeypatch.setattr(synthesis_service, "analyze_interview", fake_analyze)
    monkeypatch.setattr(service, "_send_ws", fake_send)
    conn = connect(settings.database)
    try:
        record, decision = _terminated(conn, "profile", profile_id)
        conn.commit()
        assert decision.action == "terminate"
        assert asyncio.run(manager.terminate_for_proctoring(profile_id, reason="x")) is False
        asyncio.run(
            service.dispatch_decision(
                conn=conn,
                settings=settings,
                kind="profile",
                attempt_id=profile_id,
                decision=decision,
                record=record,
            )
        )
        assert calls == [profile_id]
        attempt = store.get_profile_attempt_by_id(conn, attempt_id=profile_id)
        assert attempt["status"] == "evaluated"
        assert sent and sent[0]["type"] == "proctoring_terminated"
        assert sent[0]["content"]["reason_code"] == "gaze_violation"
    finally:
        conn.close()


def test_dispatch_warn_pauses_session_and_sends_ws(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.ai.runtime import manager

    profile_id = profile_attempt(client)
    paused: list[str] = []
    sent: list[dict] = []

    async def fake_pause(session_id: str) -> bool:
        paused.append(session_id)
        return True

    async def fake_send(session_id: str, message: dict) -> None:
        sent.append(message)

    monkeypatch.setattr(manager, "pause_for_proctoring", fake_pause)
    monkeypatch.setattr(service, "_send_ws", fake_send)
    conn = connect(settings.database)
    try:
        record, decision = service.mutate(
            conn,
            kind="profile",
            attempt_id=profile_id,
            fn=lambda r: policy.apply_event(
                r,
                type_="tab_hidden",
                now=datetime.now(UTC),
                max_warnings=2,
                cooldown_seconds=20,
                flag_dedup_seconds=30,
            ),
        )
        conn.commit()
        asyncio.run(
            service.dispatch_decision(
                conn=conn,
                settings=settings,
                kind="profile",
                attempt_id=profile_id,
                decision=decision,
                record=record,
            )
        )
        assert paused == [profile_id]
        assert sent == [
            {
                "type": "proctoring_warning",
                "content": {
                    "strike": 1,
                    "max_warnings": 2,
                    "reason_code": "tab_hidden",
                    "message": "You left the interview tab.",
                },
            }
        ]
    finally:
        conn.close()


def test_record_server_event_only_when_enabled(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[dict] = []

    async def fake_send(session_id: str, message: dict) -> None:
        sent.append(message)

    monkeypatch.setattr(service, "_send_ws", fake_send)
    profile_id = profile_attempt(client)
    result = asyncio.run(
        service.record_server_event(
            settings, kind="profile", attempt_id=profile_id, type_="detector_heartbeat_lost"
        )
    )
    assert result is None and sent == []

    conn = connect(settings.database)
    try:
        service.ensure_record(
            conn, kind="profile", attempt_id=profile_id, enabled=True, now=datetime.now(UTC)
        )
        conn.commit()
    finally:
        conn.close()
    asyncio.run(
        service.record_server_event(
            settings, kind="profile", attempt_id=profile_id, type_="candidate_disconnected"
        )
    )
    decision = asyncio.run(
        service.record_server_event(
            settings, kind="profile", attempt_id=profile_id, type_="detector_heartbeat_lost"
        )
    )
    assert decision.action == "warn" and decision.strike == 1
    assert sent[-1]["type"] == "proctoring_warning"
    conn = connect(settings.database)
    try:
        record = store.get_attempt_proctoring(conn, kind="profile", attempt_id=profile_id)
        assert [e["type"] for e in record["events"]] == [
            "candidate_disconnected",
            "detector_heartbeat_lost",
        ]
    finally:
        conn.close()
