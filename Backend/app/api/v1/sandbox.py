"""Proctored sandbox endpoints (candidate-facing).

All routes resolve the applied attempt through ``voice.load_applied_attempt``
so foreign attempt ids return 404, mirroring the voice interview endpoints.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel, Field

from app.api.dependencies import (
    CandidateContextDependency,
    DbDependency,
    SettingsDependency,
)
from app.core.errors import ApiError
from app.db import store
from app.db.database import Connection
from app.services import sandbox as sandbox_service
from app.services import voice_interview as voice

router = APIRouter(tags=["sandbox"])


def _load_attempt(
    conn: Connection, *, attempt_id: str, candidate_id: str
) -> dict[str, Any]:
    return voice.load_applied_attempt(
        conn, attempt_id=attempt_id, candidate_id=candidate_id
    )


def _load_posting(conn: Connection, attempt: dict[str, Any]) -> dict[str, Any]:
    posting = store.get_published_posting(
        conn, attempt["posting_id"]
    ) or store.get_posting_by_id(conn, posting_id=attempt["posting_id"])
    if not posting:
        raise ApiError(code="not_found", message="Posting not found.", status_code=404)
    return posting


class SandboxProgressRequest(BaseModel):
    code: str | None = None
    language: str | None = None
    answers: dict[str, str] | None = None


class SandboxViolationRequest(BaseModel):
    type: str = Field(min_length=1, max_length=64)
    detail: str = Field(default="", max_length=500)


class SandboxSubmitRequest(BaseModel):
    auto: bool = False
    # Final snapshot so a fullscreen-exit auto-submit loses nothing written
    # after the last autosave tick.
    code: str | None = None
    language: str | None = None
    answers: dict[str, str] | None = None


@router.get("/candidates/me/applied-interviews/{attempt_id}/sandbox")
async def get_sandbox(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    attempt = _load_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    posting = _load_posting(conn, attempt)
    return sandbox_service.load_sandbox_state(attempt, posting)


@router.post("/candidates/me/applied-interviews/{attempt_id}/sandbox/start")
async def start_sandbox(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    attempt = _load_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    posting = _load_posting(conn, attempt)
    session = await sandbox_service.start_sandbox(
        conn,
        attempt=attempt,
        candidate=ctx.candidate,
        posting=posting,
        settings=settings,
    )
    conn.commit()
    return {"session": sandbox_service.sanitize_session(session)}


@router.put("/candidates/me/applied-interviews/{attempt_id}/sandbox/progress")
async def save_sandbox_progress(
    attempt_id: str,
    payload: SandboxProgressRequest,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    attempt = _load_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    result = sandbox_service.save_progress(
        conn,
        attempt=attempt,
        code=payload.code,
        language=payload.language,
        answers=payload.answers,
    )
    conn.commit()
    return result


@router.post("/candidates/me/applied-interviews/{attempt_id}/sandbox/violations")
async def log_sandbox_violation(
    attempt_id: str,
    payload: SandboxViolationRequest,
    ctx: CandidateContextDependency,
    conn: DbDependency,
) -> dict[str, Any]:
    attempt = _load_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    result = sandbox_service.log_violation(
        conn, attempt=attempt, violation_type=payload.type, detail=payload.detail
    )
    conn.commit()
    return result


@router.post("/candidates/me/applied-interviews/{attempt_id}/sandbox/recording")
async def upload_sandbox_recording(
    attempt_id: str,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
    file: Annotated[UploadFile, File()],
) -> dict[str, Any]:
    attempt = _load_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    data = await file.read()
    file_name = sandbox_service.save_recording(settings, attempt_id=attempt["id"], data=data)
    sandbox_service.attach_recording(conn, attempt=attempt, file_name=file_name)
    conn.commit()
    return {"recording_path": file_name}


@router.post("/candidates/me/applied-interviews/{attempt_id}/sandbox/submit")
async def submit_sandbox(
    attempt_id: str,
    payload: SandboxSubmitRequest,
    ctx: CandidateContextDependency,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    attempt = _load_attempt(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])
    result = await sandbox_service.submit_sandbox(
        conn,
        attempt=attempt,
        settings=settings,
        auto=payload.auto,
        code=payload.code,
        language=payload.language,
        answers=payload.answers,
    )
    conn.commit()
    return result
