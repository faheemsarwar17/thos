"""Voice interview session endpoints (LiveKit + Realtime agents)."""

from __future__ import annotations

import base64
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.ai.runtime import manager as interview_manager
from app.api.dependencies import (
    CandidateContextDependency,
    DbDependency,
    SettingsDependency,
)
from app.core.errors import ApiError
from app.db import store
from app.services import identity as identity_service
from app.services import voice_interview as voice
from app.services.avatars import resolve_avatar
from app.services.synthesis_service import synthesis_service
from app.websocket.manager import get_websocket_manager

router = APIRouter(tags=["voice-interviews"])

_IDENTITY_FINAL_STATUSES = {
    identity_service.IDENTITY_MATCH,
    identity_service.IDENTITY_AMBIGUOUS,
    identity_service.IDENTITY_MISMATCH,
    identity_service.IDENTITY_NO_REFERENCE,
}

_MAX_LIVE_IMAGE_CHARS = 7_000_000  # ~5 MB binary after base64 decoding


def _session_payload(attempt: dict[str, Any], *, kind: str, title: str) -> dict[str, Any]:
    return {
        "id": attempt["id"],
        "kind": kind,
        "title": title,
        "status": attempt.get("status"),
        "room_name": attempt.get("room_name"),
        "duration_minutes": attempt.get("duration_minutes") or 10,
        "transcripts": attempt.get("transcripts") or [],
        "evaluation": attempt.get("evaluation"),
        "identity_verification": attempt.get("identity_verification"),
        "started_via": attempt.get("started_via") or "voice",
        "questions": [
            {
                "id": q.get("id"),
                "prompt": q.get("prompt"),
                "competency": q.get("competency"),
            }
            for q in (attempt.get("questions") or [])
        ],
    }


class IdentityCheckRequest(BaseModel):
    # A webcam frame as a data URL, e.g. "data:image/jpeg;base64,...".
    image: str = Field(min_length=32, max_length=_MAX_LIVE_IMAGE_CHARS)


def _decode_live_image(raw: str) -> tuple[bytes, str]:
    if "," not in raw or not raw.startswith("data:"):
        raise ApiError(
            status_code=422,
            code="invalid_image",
            message="The identity check image must be a data URL.",
        )
    header, _, encoded = raw.partition(",")
    content_type = header[5:].split(";")[0] or "image/jpeg"
    if content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise ApiError(
            status_code=422,
            code="invalid_image",
            message="The identity check image must be JPEG, PNG, or WebP.",
        )
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        raise ApiError(
            status_code=422,
            code="invalid_image",
            message="The identity check image could not be decoded.",
        ) from None
    if not data:
        raise ApiError(
            status_code=422, code="invalid_image", message="The captured frame is empty."
        )
    return data, content_type


async def _run_identity_check(
    *,
    conn: Any,
    ctx: Any,
    settings: Any,
    attempt: dict[str, Any],
    kind: str,
    image: str,
) -> dict[str, Any]:
    """Compare the candidate's PFP with a live frame. Never blocks the interview."""
    existing = attempt.get("identity_verification")
    if isinstance(existing, dict) and existing.get("status") in _IDENTITY_FINAL_STATUSES:
        return existing

    persist = (
        store.set_profile_attempt_identity
        if kind == "profile"
        else store.set_applied_attempt_identity
    )

    user = store.get_user(conn, ctx.user["id"])
    reference = resolve_avatar(settings, avatar_path=(user or {}).get("avatar_path"))
    if reference is None:
        verdict = identity_service.build_verdict(
            identity_service.IDENTITY_NO_REFERENCE,
            detail="No profile photo on file; identity could not be compared.",
        )
        persist(conn, attempt_id=attempt["id"], verification=verdict)
        conn.commit()
        return verdict

    live_image, live_content_type = _decode_live_image(image)
    reference_path, reference_content_type = reference
    verdict = await identity_service.compare_live_image(
        settings=settings,
        reference_image=reference_path.read_bytes(),
        reference_content_type=reference_content_type,
        live_image=live_image,
        live_content_type=live_content_type,
    )
    persist(conn, attempt_id=attempt["id"], verification=verdict)
    conn.commit()
    return verdict


@router.post("/candidates/me/profile-interview-attempts/{attempt_id}/voice/identity-check")
async def profile_voice_identity_check(
    attempt_id: str,
    payload: IdentityCheckRequest,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    attempt = voice.load_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    verdict = await _run_identity_check(
        conn=conn, ctx=ctx, settings=settings, attempt=attempt, kind="profile",
        image=payload.image,
    )
    return {"identity_verification": verdict}


@router.post("/candidates/me/applied-interviews/{attempt_id}/voice/identity-check")
async def applied_voice_identity_check(
    attempt_id: str,
    payload: IdentityCheckRequest,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    attempt = voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    verdict = await _run_identity_check(
        conn=conn, ctx=ctx, settings=settings, attempt=attempt, kind="applied",
        image=payload.image,
    )
    return {"identity_verification": verdict}



@router.get("/candidates/me/profile-interview-attempts/{attempt_id}/voice")
async def get_profile_voice_session(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    attempt = voice.load_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    return _session_payload(attempt, kind="profile", title="Profile Screening")


@router.post("/candidates/me/profile-interview-attempts/{attempt_id}/voice/livekit")
async def profile_voice_livekit(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, str]:
    attempt = voice.load_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    room = attempt.get("room_name") or f"profile-screening-{attempt_id}"
    identity = f"candidate-{ctx.candidate['id']}"
    return voice.issue_participant_token(settings=settings, room_name=room, identity=identity)


@router.post("/candidates/me/profile-interview-attempts/{attempt_id}/voice/start")
async def start_profile_voice(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, str]:
    voice.ensure_voice_ready(settings)
    attempt = voice.load_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    if attempt.get("status") == "evaluated":
        raise ApiError(
            code="already_evaluated",
            message="This Profile Screening is already complete.",
            status_code=409,
        )
    config = voice.build_profile_screening_config(
        attempt=attempt, candidate=ctx.candidate, settings=settings
    )
    store.update_profile_interview_voice(
        conn,
        attempt_id=attempt_id,
        status="in_progress",
        room_name=config["room_name"],
    )
    conn.commit()
    attempt["status"] = "in_progress"
    attempt["room_name"] = config["room_name"]
    await voice.start_voice_session(
        session_id=attempt_id, config=config, attempt=attempt, kind="profile"
    )
    return {"status": "starting", "attempt_id": attempt_id}


@router.post("/candidates/me/profile-interview-attempts/{attempt_id}/voice/complete")
async def complete_profile_voice(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    # Validates ownership; raises 404 for foreign or missing attempts.
    voice.load_profile_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    await voice.end_voice_session(attempt_id)
    store.update_profile_interview_voice(conn, attempt_id=attempt_id, status="submitted")
    conn.commit()
    # Analysis may already be scheduled by the agent; ensure it runs.
    await synthesis_service.analyze_interview(attempt_id)
    refreshed = voice.load_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    return _session_payload(refreshed, kind="profile", title="Profile Screening")


@router.websocket("/candidates/me/profile-interview-attempts/{attempt_id}/voice/telemetry")
async def profile_voice_telemetry(websocket: WebSocket, attempt_id: str) -> None:
    manager = get_websocket_manager()
    await websocket.accept()
    await manager.connect(attempt_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            # Forward client signals to the live interview session when needed.
            msg_type = message.get("type")
            if msg_type == "user_requested_end":
                await interview_manager.request_user_end(attempt_id)
            elif msg_type == "user_audio_activity":
                # Pipeline mode uses server-side VAD; this is a keepalive no-op.
                continue
    except WebSocketDisconnect:
        manager.disconnect(attempt_id, websocket)


@router.get("/candidates/me/applied-interviews/{attempt_id}/voice")
async def get_applied_voice_session(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    attempt = voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    posting = store.get_published_posting(conn, attempt["posting_id"]) or store.get_posting_by_id(
        conn, posting_id=attempt["posting_id"]
    ) or {}
    title = f"Job Interview — {posting.get('title') or 'Role'}"
    payload = _session_payload(attempt, kind="applied", title=title)
    sandbox_session = attempt.get("sandbox_session")
    payload["sandbox"] = {
        "required": bool(posting.get("sandbox_required")),
        "status": (
            sandbox_session.get("status") if isinstance(sandbox_session, dict) else None
        ),
    }
    return payload


@router.post("/candidates/me/applied-interviews/{attempt_id}/voice/livekit")
async def applied_voice_livekit(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, str]:
    attempt = voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    room = attempt.get("room_name") or f"job-interview-{attempt_id}"
    identity = f"candidate-{ctx.candidate['id']}"
    return voice.issue_participant_token(settings=settings, room_name=room, identity=identity)


@router.post("/candidates/me/applied-interviews/{attempt_id}/voice/start")
async def start_applied_voice(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, str]:
    voice.ensure_voice_ready(settings)
    attempt = voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    if attempt.get("status") == "evaluated":
        raise ApiError(
            code="already_evaluated",
            message="This Job Interview is already complete.",
            status_code=409,
        )
    posting = store.get_published_posting(conn, attempt["posting_id"]) or store.get_posting_by_id(
        conn, posting_id=attempt["posting_id"]
    )
    if not posting:
        raise ApiError(code="not_found", message="Posting not found.", status_code=404)
    config = voice.build_job_interview_config(
        attempt=attempt,
        candidate=ctx.candidate,
        posting=posting,
        settings=settings,
    )
    store.update_applied_interview_voice(
        conn,
        attempt_id=attempt_id,
        status="in_progress",
        room_name=config["room_name"],
    )
    conn.commit()
    attempt["status"] = "in_progress"
    attempt["room_name"] = config["room_name"]
    await voice.start_voice_session(
        session_id=attempt_id, config=config, attempt=attempt, kind="applied"
    )
    return {"status": "starting", "attempt_id": attempt_id}


@router.post("/candidates/me/applied-interviews/{attempt_id}/voice/complete")
async def complete_applied_voice(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    attempt = voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    await voice.end_voice_session(attempt_id)
    store.update_applied_interview_voice(conn, attempt_id=attempt_id, status="submitted")
    conn.commit()
    await synthesis_service.analyze_interview(attempt_id)
    posting = store.get_published_posting(conn, attempt["posting_id"]) or store.get_posting_by_id(
        conn, posting_id=attempt["posting_id"]
    ) or {}
    refreshed = voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"]
    )
    title = f"Job Interview — {posting.get('title') or 'Role'}"
    return _session_payload(refreshed, kind="applied", title=title)


@router.websocket("/candidates/me/applied-interviews/{attempt_id}/voice/telemetry")
async def applied_voice_telemetry(websocket: WebSocket, attempt_id: str) -> None:
    manager = get_websocket_manager()
    await websocket.accept()
    await manager.connect(attempt_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            msg_type = message.get("type")
            if msg_type == "user_requested_end":
                await interview_manager.request_user_end(attempt_id)
            elif msg_type == "user_audio_activity":
                # Pipeline mode uses server-side VAD; this is a keepalive no-op.
                continue
    except WebSocketDisconnect:
        manager.disconnect(attempt_id, websocket)
