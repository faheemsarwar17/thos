"""In-memory ORM-like Interview record backed by THOS attempt tables."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.api.models.choices.tracking import InterviewStatus, InterviewType


class _FilterExpr:
    def __init__(self, value: Any) -> None:
        self.value = value
        self.right = type("Right", (), {"value": value})()


class _IdAttr:
    def __get__(self, instance: Interview | None, owner: type | None = None) -> Any:
        if instance is None:
            return self
        return instance.__dict__.get("_id")

    def __set__(self, instance: Interview, value: str) -> None:
        instance.__dict__["_id"] = value

    def __eq__(self, other: object) -> _FilterExpr:  # type: ignore[override]
        return _FilterExpr(other)


class Interview:
    """Mutable session object used by ConversationAgent / AgentOrchestrator."""

    id = _IdAttr()

    def __init__(
        self,
        *,
        id: str,
        kind: str,
        status: InterviewStatus = InterviewStatus.PENDING,
        transcripts: list[dict[str, Any]] | None = None,
        started_at: datetime | None = None,
        updated_at: datetime | None = None,
        audio_url: str | None = None,
        video_url: str | None = None,
        report: dict[str, Any] | None = None,
        type: InterviewType = InterviewType.PROFILE_SCREENING,
        room_name: str | None = None,
        duration_minutes: int = 10,
        candidate_id: str | None = None,
        application_id: str | None = None,
        posting_id: str | None = None,
        evaluation: dict[str, Any] | None = None,
    ) -> None:
        self.id = id
        self.kind = kind
        self.status = status
        self.transcripts = list(transcripts or [])
        self.started_at = started_at
        self.updated_at = updated_at
        self.audio_url = audio_url
        self.video_url = video_url
        self.report = report
        self.type = type
        self.room_name = room_name
        self.duration_minutes = duration_minutes
        self.candidate_id = candidate_id
        self.application_id = application_id
        self.posting_id = posting_id
        self.evaluation = evaluation
        self._dirty = False

    def mark_dirty(self) -> None:
        self._dirty = True
