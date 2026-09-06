"""DB context shim so ported agents can persist transcripts onto attempt rows."""

from __future__ import annotations

import sys
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from types import ModuleType
from typing import Any

from app.api.models.choices.tracking import InterviewStatus, InterviewType
from app.api.models.interview import Interview
from app.core.config import get_settings
from app.db import store
from app.db.database import connect
from app.logging import logger

_LIVE: dict[str, Interview] = {}


def register_session(interview: Interview) -> Interview:
    _LIVE[interview.id] = interview
    return interview


def get_live_session(session_id: str) -> Interview | None:
    return _LIVE.get(session_id)


def flag_modified(obj: Any, _attr: str) -> None:
    if hasattr(obj, "mark_dirty"):
        obj.mark_dirty()


class _Query:
    def __init__(self, session: "_Session", model: type) -> None:
        self._session = session
        self._model = model
        self._session_id: str | None = None

    def filter(self, *exprs: Any) -> "_Query":
        for expr in exprs:
            session_id = None
            if hasattr(expr, "value"):
                session_id = expr.value
            right = getattr(expr, "right", None)
            if right is not None and hasattr(right, "value"):
                session_id = right.value
            elif isinstance(right, str):
                session_id = right
            if isinstance(expr, tuple) and len(expr) == 2:
                session_id = expr[1]
            if session_id is not None:
                self._session_id = str(session_id)
        return self

    def first(self) -> Interview | None:
        if not self._session_id:
            return None
        existing = _LIVE.get(self._session_id)
        if existing:
            self._session._tracked = existing
            return existing
        loaded = _load_from_store(self._session_id)
        if loaded:
            _LIVE[loaded.id] = loaded
            self._session._tracked = loaded
        return loaded


class _Session:
    def __init__(self) -> None:
        self._tracked: Interview | None = None

    def query(self, model: type) -> _Query:
        return _Query(self, model)

    def commit(self) -> None:
        if self._tracked is None:
            return
        _persist(self._tracked)
        self._tracked._dirty = False

    def refresh(self, obj: Interview) -> None:
        refreshed = _load_from_store(obj.id)
        if refreshed is None:
            return
        obj.status = refreshed.status
        obj.transcripts = refreshed.transcripts
        obj.started_at = refreshed.started_at
        obj.evaluation = refreshed.evaluation
        obj.report = refreshed.report


@contextmanager
def get_db_context() -> Iterator[_Session]:
    yield _Session()


def _status_from_row(raw: str | None) -> InterviewStatus:
    value = (raw or "").lower()
    if value in {"evaluated", "analyzed"}:
        return InterviewStatus.ANALYZED
    if value in {"submitted", "completed"}:
        return InterviewStatus.COMPLETED
    if value == "in_progress":
        return InterviewStatus.IN_PROGRESS
    if value == "failed":
        return InterviewStatus.FAILED
    return InterviewStatus.PENDING


def _load_from_store(session_id: str) -> Interview | None:
    settings = get_settings()
    conn = connect(settings.database)
    try:
        profile = store.get_profile_attempt_by_id(conn, attempt_id=session_id)
        if profile:
            return Interview(
                id=profile["id"],
                kind="profile",
                status=_status_from_row(profile.get("status")),
                transcripts=list(profile.get("transcripts") or []),
                started_at=_parse_dt(profile.get("started_at")),
                room_name=profile.get("room_name"),
                duration_minutes=int(profile.get("duration_minutes") or 10),
                candidate_id=profile.get("candidate_id"),
                evaluation=profile.get("evaluation"),
                report=profile.get("evaluation"),
                type=InterviewType.PROFILE_SCREENING,
            )
        applied = store.get_applied_attempt_by_id(conn, attempt_id=session_id)
        if applied:
            return Interview(
                id=applied["id"],
                kind="applied",
                status=_status_from_row(applied.get("status")),
                transcripts=list(applied.get("transcripts") or []),
                started_at=_parse_dt(applied.get("started_at")),
                room_name=applied.get("room_name"),
                duration_minutes=int(applied.get("duration_minutes") or 10),
                candidate_id=applied.get("candidate_id"),
                application_id=applied.get("application_id"),
                posting_id=applied.get("posting_id"),
                evaluation=applied.get("evaluation"),
                report=applied.get("evaluation"),
                type=InterviewType.JOB_INTERVIEW,
            )
    finally:
        conn.close()
    return None


def _persist(interview: Interview) -> None:
    settings = get_settings()
    status_value = _to_store_status(interview)
    started = (
        interview.started_at.astimezone(UTC).isoformat()
        if isinstance(interview.started_at, datetime)
        else interview.started_at
    )
    conn = connect(settings.database)
    try:
        if interview.kind == "profile":
            store.update_profile_interview_voice(
                conn,
                attempt_id=interview.id,
                status=status_value,
                transcripts=interview.transcripts,
                started_at=started,
                evaluation=interview.evaluation or interview.report,
                room_name=interview.room_name,
            )
        else:
            store.update_applied_interview_voice(
                conn,
                attempt_id=interview.id,
                status=status_value,
                transcripts=interview.transcripts,
                started_at=started,
                evaluation=interview.evaluation or interview.report,
                room_name=interview.room_name,
            )
        conn.commit()
    finally:
        conn.close()
    logger.debug(f"Persisted voice interview session {interview.id} status={status_value}")


def _to_store_status(interview: Interview) -> str:
    if interview.status == InterviewStatus.ANALYZED:
        return "evaluated"
    if interview.status == InterviewStatus.COMPLETED:
        return "submitted"
    if interview.status == InterviewStatus.IN_PROGRESS:
        return "in_progress"
    if interview.status == InterviewStatus.FAILED:
        return "failed"
    if interview.kind == "applied":
        return "invited"
    return "in_progress"


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


_sa_mod = ModuleType("sqlalchemy")
_sa_orm = ModuleType("sqlalchemy.orm")
_sa_attr = ModuleType("sqlalchemy.orm.attributes")
_sa_attr.flag_modified = flag_modified  # type: ignore[attr-defined]
sys.modules.setdefault("sqlalchemy", _sa_mod)
sys.modules.setdefault("sqlalchemy.orm", _sa_orm)
sys.modules.setdefault("sqlalchemy.orm.attributes", _sa_attr)
