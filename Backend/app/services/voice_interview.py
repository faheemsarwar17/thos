"""Build voice-interview contexts and start/stop pipeline sessions."""

from __future__ import annotations

from typing import Any

from app.ai.runtime import manager
from app.api.models.choices.tracking import InterviewStatus, InterviewType
from app.api.models.database import register_session
from app.api.models.interview import Interview
from app.core.config import Settings
from app.core.errors import ApiError
from app.db import store
from app.db.database import Connection


def _profile_text(candidate: dict[str, Any]) -> str:
    profile = candidate.get("profile") or {}
    parsed = candidate.get("parsed_cv") or {}
    parts = [
        profile.get("headline") or "",
        profile.get("summary") or "",
        "Skills: " + ", ".join(profile.get("skills") or []),
        parsed.get("summary") or "",
    ]
    return "\n".join(p for p in parts if p).strip() or "No profile details available."


def _question_entries(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for idx, question in enumerate(questions, start=1):
        prompt = (question.get("prompt") or question.get("text") or "").strip()
        if not prompt:
            continue
        entries.append(
            {
                "id": str(question.get("id") or f"q{idx}"),
                "prompt": prompt,
                "competency": str(
                    question.get("competency") or question.get("theme") or f"Theme {idx}"
                ),
            }
        )
    return entries


def build_profile_screening_config(
    *,
    attempt: dict[str, Any],
    candidate: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Structured context for the plan generator (Profile Screening)."""
    name = (
        (candidate.get("profile") or {}).get("full_name")
        or candidate.get("display_name")
        or "Candidate"
    )
    questions = _question_entries(list(attempt.get("questions") or []))
    return {
        "interview_type": InterviewType.PROFILE_SCREENING.value,
        "session_kind": "profile",
        "subject_name": name,
        "candidate_profile": _profile_text(candidate),
        "questions": questions,
        "competencies": [q["competency"] for q in questions],
        "language": settings.default_interview_language,
        "duration_minutes": int(
            attempt.get("duration_minutes") or settings.default_interview_length_minutes
        ),
        "transcripts": list(attempt.get("transcripts") or []),
        "room_name": attempt.get("room_name") or f"profile-screening-{attempt['id']}",
    }


def build_job_interview_config(
    *,
    attempt: dict[str, Any],
    candidate: dict[str, Any],
    posting: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Structured context for the plan generator (Job Interview, locked pool)."""
    name = (
        (candidate.get("profile") or {}).get("full_name")
        or candidate.get("display_name")
        or "Candidate"
    )
    title = posting.get("title") or "Open role"
    questions = _question_entries(list(attempt.get("questions") or []))
    return {
        "interview_type": InterviewType.JOB_INTERVIEW.value,
        "session_kind": "applied",
        "subject_name": name,
        "candidate_profile": _profile_text(candidate),
        "job_title": title,
        "job_description": (posting.get("description") or "").strip()
        or "No job description provided.",
        "questions": questions,
        "competencies": [q["competency"] for q in questions],
        "language": settings.default_interview_language,
        "duration_minutes": int(
            attempt.get("duration_minutes") or settings.default_interview_length_minutes
        ),
        "transcripts": list(attempt.get("transcripts") or []),
        "room_name": attempt.get("room_name") or f"job-interview-{attempt['id']}",
    }


def ensure_voice_ready(settings: Settings) -> None:
    if not settings.livekit_is_configured:
        raise ApiError(
            code="livekit_not_configured",
            message=(
                "LiveKit is not configured. Set THOS_LIVEKIT_URL, "
                "THOS_LIVEKIT_API_KEY, and THOS_LIVEKIT_API_SECRET."
            ),
            status_code=503,
        )
    if not settings.ai_is_configured:
        raise ApiError(
            code="ai_not_configured",
            message="OpenAI is not configured. Set THOS_AI_API_KEY for voice interviews.",
            status_code=503,
        )


def _register_live_session(attempt: dict[str, Any], *, kind: str) -> Interview:
    interview = Interview(
        id=attempt["id"],
        kind=kind,
        status=InterviewStatus.IN_PROGRESS,
        transcripts=list(attempt.get("transcripts") or []),
        room_name=attempt.get("room_name"),
        duration_minutes=int(attempt.get("duration_minutes") or 10),
        candidate_id=attempt.get("candidate_id"),
        application_id=attempt.get("application_id"),
        posting_id=attempt.get("posting_id"),
        type=(
            InterviewType.PROFILE_SCREENING
            if kind == "profile"
            else InterviewType.JOB_INTERVIEW
        ),
    )
    return register_session(interview)


async def start_voice_session(
    *,
    session_id: str,
    config: dict[str, Any],
    attempt: dict[str, Any],
    kind: str,
) -> None:
    from app.core.config import get_settings

    _register_live_session(attempt, kind=kind)
    await manager.start_session(
        session_id=session_id, kind=kind, config=config, settings=get_settings()
    )


async def end_voice_session(session_id: str) -> None:
    await manager.end_session(session_id)


def issue_participant_token(
    *,
    settings: Settings,
    room_name: str,
    identity: str,
) -> dict[str, str]:
    from datetime import timedelta

    from livekit.api import AccessToken, VideoGrants

    ensure_voice_ready(settings)
    secret = settings.livekit_api_secret
    assert secret is not None
    token = (
        AccessToken(settings.livekit_api_key, secret.get_secret_value())
        .with_identity(identity)
        .with_name(identity)
        .with_ttl(timedelta(seconds=settings.livekit_token_ttl_seconds))
        .with_grants(VideoGrants(room_join=True, room=room_name))
        .to_jwt()
    )
    return {"token": token, "ws_url": settings.livekit_ws_url, "room_name": room_name}


def load_profile_attempt(
    conn: Connection, *, attempt_id: str, candidate_id: str
) -> dict[str, Any]:
    attempt = store.get_profile_attempt(conn, attempt_id=attempt_id, candidate_id=candidate_id)
    if not attempt:
        raise ApiError(
            code="not_found", message="Profile Screening attempt not found.", status_code=404
        )
    return attempt


def load_applied_attempt(
    conn: Connection, *, attempt_id: str, candidate_id: str
) -> dict[str, Any]:
    attempt = store.get_applied_attempt_for_candidate(
        conn, attempt_id=attempt_id, candidate_id=candidate_id
    )
    if not attempt:
        raise ApiError(
            code="not_found", message="Job Interview attempt not found.", status_code=404
        )
    return attempt
