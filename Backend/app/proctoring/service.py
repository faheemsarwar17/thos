"""Proctoring I/O: atomic record updates, snapshot files, retention, decision dispatch.

The policy (``policy.py``) decides; this module persists and acts on the decision.
Never logs snapshots, embeddings or transcripts (rules.md 2.4).
"""

from __future__ import annotations

import re
import shutil
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.db import store
from app.db.database import Connection
from app.logging import logger
from app.proctoring import policy
from app.services.identity import decode_data_url_image

_EVENT_ID = re.compile(r"^pev_[0-9a-f]{16}$")
_SNAPSHOT_FILE = re.compile(r"^pev_[0-9a-f]{16}\.jpg$")
_ATTEMPT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_JPEG_MAGIC = b"\xff\xd8\xff"


class SnapshotError(ValueError):
    """The snapshot was rejected (bad type, size or identifiers)."""


def utcnow() -> datetime:
    return datetime.now(UTC)


# --- record persistence -------------------------------------------------------------


def mutate[T](
    conn: Connection, *, kind: str, attempt_id: str, fn: Callable[[dict[str, Any]], T]
) -> tuple[dict[str, Any], T]:
    """Lock the attempt row, load (or create) the record, apply ``fn``, save it.

    The caller commits.
    """
    store.lock_attempt_row(conn, kind=kind, attempt_id=attempt_id)
    record = store.get_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id)
    if record is None:
        record = policy.new_record(enabled=False, kind=kind, now=utcnow())
    result = fn(record)
    store.set_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id, record=record)
    return record, result


def ensure_record(
    conn: Connection, *, kind: str, attempt_id: str, enabled: bool, now: datetime
) -> dict[str, Any]:
    """Freeze ``enabled`` the first time the interview starts; later starts keep it."""

    def freeze(record: dict[str, Any]) -> None:
        if not record.get("started_at_interview"):
            record["enabled"] = enabled
            record["started_at_interview"] = now.isoformat()

    record, _ = mutate(conn, kind=kind, attempt_id=attempt_id, fn=freeze)
    return record


# --- snapshots ----------------------------------------------------------------------


def _snapshot_dir(settings: Settings, attempt_id: str) -> Path:
    if not _ATTEMPT_ID.match(attempt_id):
        raise SnapshotError("Invalid attempt id.")
    return Path(settings.snapshots_dir) / attempt_id


def save_snapshot(settings: Settings, *, attempt_id: str, event_id: str, data_url: str) -> str:
    """Store one JPEG still for a gaze event. Returns the file name."""
    if not _EVENT_ID.match(event_id):
        raise SnapshotError("Invalid event id.")
    folder = _snapshot_dir(settings, attempt_id)
    try:
        data, _ = decode_data_url_image(
            data_url, allowed=frozenset({"image/jpeg"}), label="The snapshot"
        )
    except ValueError as exc:
        raise SnapshotError(str(exc)) from None
    if len(data) > settings.proctoring_snapshot_max_bytes:
        raise SnapshotError("The snapshot is too large.")
    if not data.startswith(_JPEG_MAGIC):
        raise SnapshotError("The snapshot is not a JPEG image.")
    folder.mkdir(parents=True, exist_ok=True)
    file_name = f"{event_id}.jpg"
    (folder / file_name).write_bytes(data)
    return file_name


def read_snapshot(settings: Settings, *, attempt_id: str, file_name: str) -> bytes | None:
    if not _SNAPSHOT_FILE.match(file_name) or not _ATTEMPT_ID.match(attempt_id):
        return None
    path = Path(settings.snapshots_dir) / attempt_id / file_name
    try:
        return path.read_bytes()
    except OSError:
        return None


def delete_snapshot(settings: Settings, *, attempt_id: str, file_name: str) -> None:
    if not _SNAPSHOT_FILE.match(file_name) or not _ATTEMPT_ID.match(attempt_id):
        return
    (Path(settings.snapshots_dir) / attempt_id / file_name).unlink(missing_ok=True)


def delete_attempt_snapshots(settings: Settings, *, attempt_id: str) -> None:
    if not _ATTEMPT_ID.match(attempt_id):
        return
    shutil.rmtree(Path(settings.snapshots_dir) / attempt_id, ignore_errors=True)


def _mark_purged(conn: Connection, *, attempt_id: str, event_id: str) -> None:
    for kind in ("applied", "profile"):
        record = store.get_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id)
        if not record or not any(e.get("id") == event_id for e in record.get("events", [])):
            continue

        def purge(r: dict[str, Any]) -> None:
            for event in r.get("events", []):
                if event.get("id") == event_id:
                    event["snapshot"] = None
                    event["snapshot_purged"] = True

        mutate(conn, kind=kind, attempt_id=attempt_id, fn=purge)
        conn.commit()
        return


def purge_expired_snapshots(conn: Connection, settings: Settings, *, now: datetime) -> int:
    """Delete snapshots older than the retention period and mark their events purged."""
    root = Path(settings.snapshots_dir)
    if not root.is_dir():
        return 0
    cutoff = now - timedelta(days=settings.proctoring_snapshot_retention_days)
    removed = 0
    for folder in root.iterdir():
        if not folder.is_dir() or not _ATTEMPT_ID.match(folder.name):
            continue
        for path in folder.glob("pev_*.jpg"):
            if not _SNAPSHOT_FILE.match(path.name):
                continue
            modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
            if modified >= cutoff:
                continue
            path.unlink(missing_ok=True)
            removed += 1
            _mark_purged(conn, attempt_id=folder.name, event_id=path.stem)
        if not any(folder.iterdir()):
            folder.rmdir()
    if removed:
        logger.info(f"Purged {removed} expired proctoring snapshot(s)")
    return removed


# --- decisions ----------------------------------------------------------------------


async def _send_ws(session_id: str, message: dict[str, Any]) -> None:
    from app.websocket.manager import get_websocket_manager

    await get_websocket_manager().send_message(session_id, message)


def _event_type(record: dict[str, Any], event_id: str | None) -> str | None:
    return next((e["type"] for e in record.get("events", []) if e.get("id") == event_id), None)


async def dispatch_decision(
    *,
    conn: Connection,
    settings: Settings,
    kind: str,
    attempt_id: str,
    decision: policy.Decision,
    record: dict[str, Any],
) -> None:
    """Act on a committed decision: pause and warn, or end the interview."""
    from app.ai.runtime import manager as interview_manager

    if decision.action == "warn":
        reason_code = _event_type(record, decision.event_id) or "gaze_violation"
        await interview_manager.pause_for_proctoring(attempt_id)
        await _send_ws(
            attempt_id,
            {
                "type": "proctoring_warning",
                "content": {
                    "strike": decision.strike,
                    "max_warnings": settings.proctoring_max_warnings,
                    "reason_code": reason_code,
                    "message": policy.reason_message(reason_code),
                },
            },
        )
        return
    if decision.action != "terminate":
        return

    # Tell the browser first so it shows the Terminated card, not "complete".
    await _send_ws(
        attempt_id,
        {
            "type": "proctoring_terminated",
            "content": {
                "reason_code": policy.TERMINATION_REASON,
                "message": policy.termination_message(record),
            },
        },
    )
    handled = await interview_manager.terminate_for_proctoring(
        attempt_id, reason=policy.TERMINATION_REASON
    )
    if handled:
        return
    # No live session: submit and evaluate here, the same way /voice/complete does.
    from app.services.synthesis_service import synthesis_service

    update = (
        store.update_applied_interview_voice
        if kind == "applied"
        else store.update_profile_interview_voice
    )
    update(conn, attempt_id=attempt_id, status="submitted")
    conn.commit()
    await synthesis_service.analyze_interview(attempt_id)
