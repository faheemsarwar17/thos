"""Pure proctoring policy: strikes, warnings, termination, views. No I/O.

The record is a plain dict stored as JSON on the attempt row (PRD §6).
Functions mutate the record passed in; callers persist it.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

RECORD_VERSION = 1
MAX_EVENTS = 500
TERMINATION_REASON = "gaze_violation"

GAZE_VIOLATIONS: frozenset[str] = frozenset(
    {
        "gaze_off_screen_sustained",
        "gaze_repeated_glances",
        "gaze_reading_pattern",
        "face_missing",
        "tab_hidden",
        "window_blur",
        "detector_heartbeat_lost",
    }
)
FLAGS: frozenset[str] = frozenset(
    {
        "multiple_faces",
        "voice_mismatch",
        "second_voice",
        "whisper_background",
        "tts_cadence",
        "speech_during_ai_turn",
    }
)
SESSION_EVENTS: frozenset[str] = frozenset(
    {
        "consent_given",
        "calibration_completed",
        "enrolment_completed",
        "enrolment_fallback",
        "warning_acknowledged",
        "candidate_disconnected",
        "terminated",
        "voice_model_unavailable",
    }
)
# Types a browser may POST (server-only types are rejected at the API layer).
BROWSER_EVENT_TYPES: frozenset[str] = (GAZE_VIOLATIONS - {"detector_heartbeat_lost"}) | {
    "multiple_faces",
    "speech_during_ai_turn",
}

_MESSAGES = {
    "gaze_off_screen_sustained": "You looked away from the screen for too long.",
    "gaze_repeated_glances": "You repeatedly looked at the same place away from the screen.",
    "gaze_reading_pattern": "It looked like you were reading from somewhere off the screen.",
    "face_missing": "Your face was not visible to the camera.",
    "tab_hidden": "You left the interview tab.",
    "window_blur": "You switched to another window.",
    "detector_heartbeat_lost": "Proctoring stopped responding in your browser.",
}

Action = Literal["none", "warn", "terminate"]


class PolicyError(ValueError):
    """Invalid transition (e.g. acknowledging a warning that is not pending)."""


@dataclass(frozen=True)
class Decision:
    action: Action
    counted: bool
    strike: int | None
    event_id: str | None
    note: str | None
    warnings_used: int


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def family_of(type_: str) -> str:
    if type_ in GAZE_VIOLATIONS:
        return "gaze"
    if type_ == "multiple_faces":
        return "gaze"
    if type_ in FLAGS:
        return "voice"
    if type_ in SESSION_EVENTS:
        return "session"
    raise ValueError(f"unknown proctoring event type: {type_}")


def new_record(*, enabled: bool, kind: str, now: datetime) -> dict[str, Any]:
    return {
        "version": RECORD_VERSION,
        "enabled": enabled,
        "kind": kind,
        "started_at": _iso(now),
        "consent": None,
        "calibration": None,
        "strikes": 0,
        "last_strike_at": None,
        "pending_warning": None,
        "terminated": None,
        "heartbeat_at": None,
        "voice": {"enrolled": False, "source": None, "model": None},
        "events": [],
        "history": [],
    }


def _new_event_id() -> str:
    return f"pev_{secrets.token_hex(8)}"


def _append(record: dict[str, Any], event: dict[str, Any]) -> None:
    events = record.setdefault("events", [])
    events.append(event)
    if len(events) > MAX_EVENTS:
        # Drop oldest session events first, then oldest uncounted; never counted strikes.
        for predicate in (
            lambda e: e.get("family") == "session",
            lambda e: not e.get("counted"),
        ):
            while len(events) > MAX_EVENTS:
                idx = next((i for i, e in enumerate(events) if predicate(e)), None)
                if idx is None:
                    break
                events.pop(idx)


def record_session_event(
    record: dict[str, Any], *, type_: str, now: datetime, metrics: dict[str, Any] | None = None
) -> dict[str, Any]:
    if type_ not in SESSION_EVENTS:
        raise ValueError(f"not a session event: {type_}")
    event = {
        "id": _new_event_id(),
        "family": "session",
        "type": type_,
        "at": _iso(now),
        "counted": False,
        "strike": None,
        "note": None,
        "metrics": metrics or {},
        "snapshot": None,
    }
    _append(record, event)
    return event


def _warnings_used(record: dict[str, Any], max_warnings: int) -> int:
    return min(int(record.get("strikes") or 0), max_warnings)


def apply_event(
    record: dict[str, Any],
    *,
    type_: str,
    now: datetime,
    max_warnings: int,
    cooldown_seconds: float,
    flag_dedup_seconds: float,
    metrics: dict[str, Any] | None = None,
    snapshot: str | None = None,
    event_id: str | None = None,
) -> Decision:
    family = family_of(type_)
    if family == "session":
        raise ValueError("use record_session_event for session events")
    event = {
        "id": event_id or _new_event_id(),
        "family": family,
        "type": type_,
        "at": _iso(now),
        "counted": False,
        "strike": None,
        "note": None,
        "metrics": metrics or {},
        "snapshot": snapshot,
    }
    used = _warnings_used(record, max_warnings)

    if type_ not in GAZE_VIOLATIONS:  # flags
        for past in reversed(record.get("events", [])):
            if past.get("type") != type_:
                continue
            at = _parse(past.get("at"))
            if at and (now - at).total_seconds() < flag_dedup_seconds:
                return Decision("none", False, None, None, "deduplicated", used)
            break
        _append(record, event)
        return Decision("none", False, None, event["id"], None, used)

    note: str | None = None
    if record.get("terminated"):
        note = "after_termination"
    elif record.get("pending_warning"):
        note = "warning_pending"
    else:
        last = _parse(record.get("last_strike_at"))
        if last and (now - last).total_seconds() < cooldown_seconds:
            note = "cooldown"
    if note:
        event["note"] = note
        _append(record, event)
        return Decision("none", False, None, event["id"], note, used)

    strikes = int(record.get("strikes") or 0) + 1
    record["strikes"] = strikes
    record["last_strike_at"] = _iso(now)
    event.update(counted=True, strike=strikes)
    _append(record, event)
    if strikes <= max_warnings:
        record["pending_warning"] = {"strike": strikes, "event_id": event["id"], "at": _iso(now)}
        return Decision(
            "warn", True, strikes, event["id"], None, _warnings_used(record, max_warnings)
        )
    counted = [e for e in record["events"] if e.get("counted")]
    record["terminated"] = {
        "reason": TERMINATION_REASON,
        "at": _iso(now),
        "event_id": event["id"],
        "strike": strikes,
        "strikes": [{"type": e["type"], "at": e["at"], "event_id": e["id"]} for e in counted],
    }
    record_session_event(record, type_="terminated", now=now, metrics={"strikes": strikes})
    return Decision("terminate", True, strikes, event["id"], None, max_warnings)


def acknowledge(record: dict[str, Any], *, strike: int, now: datetime) -> None:
    pending = record.get("pending_warning")
    if not pending or int(pending.get("strike", -1)) != int(strike):
        raise PolicyError("no matching pending warning")
    record["pending_warning"] = None
    record_session_event(record, type_="warning_acknowledged", now=now, metrics={"strike": strike})


def heartbeat(record: dict[str, Any], *, now: datetime) -> None:
    record["heartbeat_at"] = _iso(now)


def outcome(record: dict[str, Any] | None) -> str | None:
    if not record or not record.get("enabled"):
        return None
    if record.get("terminated"):
        return "terminated"
    if int(record.get("strikes") or 0) > 0:
        return "flagged"
    if any(e.get("type") in FLAGS for e in record.get("events", [])):
        return "flagged"
    return "clean"


def reason_message(code: str) -> str:
    return _MESSAGES.get(code, "A proctoring rule was triggered.")


def termination_message(record: dict[str, Any]) -> str | None:
    term = record.get("terminated")
    if not term:
        return None
    parts = [reason_message(s["type"]) for s in term.get("strikes", [])]
    return f"{len(parts)} proctoring violations: " + " ".join(parts)


def public_view(
    record: dict[str, Any] | None, *, audience: str, max_warnings: int
) -> dict[str, Any] | None:
    if record is None:
        return None
    base = {
        "enabled": bool(record.get("enabled")),
        "max_warnings": max_warnings,
        "warnings_used": _warnings_used(record, max_warnings),
        "pending_warning": record.get("pending_warning"),
        "terminated": (
            {
                "reason_code": record["terminated"]["reason"],
                "message": termination_message(record),
                "at": record["terminated"]["at"],
                "strikes": [
                    {"type": s["type"], "at": s["at"], "message": reason_message(s["type"])}
                    for s in record["terminated"].get("strikes", [])
                ],
            }
            if record.get("terminated")
            else None
        ),
    }
    if audience == "candidate":
        calibration = record.get("calibration") or {}
        env = calibration.get("envelope")
        base["consent_given"] = bool(record.get("consent"))
        base["calibrated"] = bool(calibration)
        base["envelope"] = (
            {
                "yaw": env["yaw"],
                "pitch": env["pitch"],
                "irisH": env["iris_h"],
                "irisV": env["iris_v"],
            }
            if env
            else None
        )
        return base
    flags: dict[str, int] = {}
    for e in record.get("events", []):
        if e.get("type") in FLAGS:
            flags[e["type"]] = flags.get(e["type"], 0) + 1
    return {
        **base,
        "outcome": outcome(record),
        "strikes": int(record.get("strikes") or 0),
        "counts": {"strikes": int(record.get("strikes") or 0), "flags": flags},
        "consent": record.get("consent"),
        "calibration": (
            {
                "completed_at": record["calibration"].get("completed_at"),
                "face_presence": record["calibration"].get("face_presence"),
            }
            if record.get("calibration")
            else None
        ),
        "voice": record.get("voice"),
        "events": [
            {
                k: e.get(k)
                for k in (
                    "id",
                    "family",
                    "type",
                    "at",
                    "counted",
                    "strike",
                    "note",
                    "metrics",
                    "snapshot",
                    "snapshot_purged",
                )
            }
            | {"label": reason_message(e["type"]) if e["type"] in GAZE_VIOLATIONS else e["type"]}
            for e in record.get("events", [])
        ],
        "history_count": len(record.get("history") or []),
    }
