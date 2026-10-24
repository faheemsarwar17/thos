"""Interview proctoring endpoints (PRD §7).

The browser reports observations; the server decides strikes, warnings and termination.
Candidate responses only ever use ``policy.public_view(record, audience="candidate")``.
"""

from __future__ import annotations

import asyncio
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, File, Request, UploadFile
from pydantic import BaseModel, Field, field_validator

from app.ai.runtime import manager as interview_manager
from app.api.dependencies import CandidateContextDependency, DbDependency, SettingsDependency
from app.core.config import Settings
from app.core.errors import ApiError
from app.db.database import Connection
from app.logging import logger
from app.proctoring import enrolment, policy
from app.proctoring import service as proctoring_service
from app.proctoring import voice as voice_proctoring
from app.proctoring.config import ProctoringConfig
from app.services import voice_interview as voice

router = APIRouter(tags=["proctoring"])

_BASES = {
    "profile": "/candidates/me/profile-interview-attempts/{attempt_id}/voice/proctoring",
    "applied": "/candidates/me/applied-interviews/{attempt_id}/voice/proctoring",
}
_MAX_SNAPSHOT_CHARS = 600_000  # a 400 KB JPEG as base64, plus the data URL header
# Starlette spools uploads over 1 MB to a temp file; staying under keeps audio off disk.
_MAX_ENROLMENT_BYTES = 1_000_000


# --- helpers ------------------------------------------------------------------------


def _load(conn: Connection, ctx: Any, kind: str, attempt_id: str) -> dict[str, Any]:
    loader = voice.load_applied_attempt if kind == "applied" else voice.load_profile_attempt
    return loader(conn, attempt_id=attempt_id, candidate_id=ctx.candidate["id"])


def _cfg(settings: Settings) -> ProctoringConfig:
    return ProctoringConfig.from_settings(settings)


def _adopt(record: dict[str, Any], enabled: bool) -> None:
    """Keep ``enabled`` current on a record whose interview hasn't started yet."""
    if not record.get("started_at_interview"):
        record["enabled"] = enabled


def _state(conn: Connection, attempt: dict[str, Any], kind: str, cfg: ProctoringConfig) -> dict:
    enabled = proctoring_service.enabled_for(conn, attempt, kind)
    record = attempt.get("proctoring") or policy.new_record(
        enabled=enabled, kind=kind, now=proctoring_service.utcnow()
    )
    view = policy.public_view(record, audience="candidate", max_warnings=cfg.max_warnings) or {}
    return {
        **view,
        "enabled": enabled,
        "config": cfg.client_view(),
        "consent_required": enabled and not record.get("consent"),
        "calibration_required": enabled and not record.get("calibration"),
    }


# --- request models -----------------------------------------------------------------


class ConsentRequest(BaseModel):
    accepted: bool
    signature_name: str = Field(max_length=200)
    policy_version: str = Field(max_length=50)


Pair = Annotated[list[float], Field(min_length=2, max_length=2)]


class Envelope(BaseModel):
    yaw: Pair
    pitch: Pair
    iris_h: Pair
    iris_v: Pair

    @field_validator("yaw", "pitch", "iris_h", "iris_v")
    @classmethod
    def ordered_and_bounded(cls, pair: list[float]) -> list[float]:
        lo, hi = pair
        if lo > hi or not (-90 <= lo <= 90 and -90 <= hi <= 90):
            raise ValueError("each range must be [low, high] within ±90")
        return pair


class CalibrationRequest(BaseModel):
    envelope: Envelope
    face_presence: float = Field(ge=0, le=1)


Metric = str | int | float | bool


class EventRequest(BaseModel):
    type: str = Field(max_length=64)
    client_ts: float
    metrics: dict[str, Metric] = Field(default_factory=dict, max_length=30)
    snapshot: str | None = Field(default=None, max_length=_MAX_SNAPSHOT_CHARS)

    @field_validator("metrics")
    @classmethod
    def short_values(cls, metrics: dict[str, Metric]) -> dict[str, Metric]:
        for key, value in metrics.items():
            if len(key) > 64 or (isinstance(value, str) and len(value) > 200):
                raise ValueError("metric keys and values must be short")
        return metrics


class AcknowledgeRequest(BaseModel):
    strike: int = Field(ge=1)


class HeartbeatRequest(BaseModel):
    client_ts: float
    fps: float = Field(ge=0, le=240)
    face_present: bool


# --- implementations ----------------------------------------------------------------


def _get(kind: str, attempt_id: str, ctx: Any, conn: Connection, settings: Settings) -> dict:
    attempt = _load(conn, ctx, kind, attempt_id)
    return _state(conn, attempt, kind, _cfg(settings))


def _consent(
    kind: str,
    attempt_id: str,
    body: ConsentRequest,
    request: Request,
    ctx: Any,
    conn: Connection,
    settings: Settings,
) -> dict:
    attempt = _load(conn, ctx, kind, attempt_id)
    cfg = _cfg(settings)
    name = body.signature_name.strip()
    if body.accepted is not True:
        raise ApiError(status_code=422, code="consent_required", message="Consent is required.")
    if not 2 <= len(name) <= 120:
        raise ApiError(
            status_code=422,
            code="invalid_signature",
            message="Type your full name (2 to 120 characters) to sign.",
        )
    if body.policy_version != cfg.policy_version:
        raise ApiError(
            status_code=422,
            code="stale_policy",
            message="The proctoring policy has changed. Reload the page and review it again.",
        )
    enabled = proctoring_service.enabled_for(conn, attempt, kind)
    now = proctoring_service.utcnow()

    def give(record: dict[str, Any]) -> None:
        _adopt(record, enabled)
        record["consent"] = {
            "accepted_at": now.isoformat(),
            "signature_name": name,
            "policy_version": body.policy_version,
            "user_agent": (request.headers.get("user-agent") or "")[:300],
        }
        policy.record_session_event(record, type_="consent_given", now=now)

    proctoring_service.mutate(conn, kind=kind, attempt_id=attempt_id, fn=give)
    conn.commit()
    return {"ok": True}


def _calibration(
    kind: str,
    attempt_id: str,
    body: CalibrationRequest,
    ctx: Any,
    conn: Connection,
    settings: Settings,
) -> dict:
    attempt = _load(conn, ctx, kind, attempt_id)
    cfg = _cfg(settings)
    if body.face_presence < cfg.calibration_min_presence:
        raise ApiError(
            status_code=422,
            code="calibration_failed",
            message="We couldn't see your face clearly. Improve lighting and face the camera.",
        )
    enabled = proctoring_service.enabled_for(conn, attempt, kind)
    now = proctoring_service.utcnow()

    def calibrate(record: dict[str, Any]) -> None:
        _adopt(record, enabled)
        record["calibration"] = {
            "completed_at": now.isoformat(),
            "envelope": body.envelope.model_dump(),
            "face_presence": round(body.face_presence, 3),
        }
        policy.record_session_event(
            record,
            type_="calibration_completed",
            now=now,
            metrics={"face_presence": round(body.face_presence, 3)},
        )

    proctoring_service.mutate(conn, kind=kind, attempt_id=attempt_id, fn=calibrate)
    conn.commit()
    return {"ok": True}


async def _event(
    kind: str,
    attempt_id: str,
    body: EventRequest,
    ctx: Any,
    conn: Connection,
    settings: Settings,
) -> dict:
    attempt = _load(conn, ctx, kind, attempt_id)
    if body.type not in policy.BROWSER_EVENT_TYPES:
        raise ApiError(
            status_code=422, code="invalid_event_type", message="Unknown proctoring event type."
        )
    if attempt.get("status") != "in_progress":
        raise ApiError(
            status_code=409, code="attempt_not_active", message="This interview is not active."
        )
    enabled = proctoring_service.enabled_for(conn, attempt, kind)
    if not enabled:
        raise ApiError(
            status_code=409,
            code="proctoring_disabled",
            message="Proctoring is off for this interview.",
        )
    if body.snapshot is not None and (kind != "applied" or policy.family_of(body.type) != "gaze"):
        raise ApiError(
            status_code=422,
            code="snapshot_not_allowed",
            message="Snapshots are only kept for gaze events in job interviews.",
        )
    cfg = _cfg(settings)
    event_id = f"pev_{secrets.token_hex(8)}"
    file_name: str | None = None
    if body.snapshot is not None:
        try:
            file_name = proctoring_service.save_snapshot(
                settings, attempt_id=attempt_id, event_id=event_id, data_url=body.snapshot
            )
        except proctoring_service.SnapshotError as exc:
            raise ApiError(status_code=422, code="invalid_snapshot", message=str(exc)) from None

    def apply(record: dict[str, Any]) -> policy.Decision:
        _adopt(record, enabled)
        return policy.apply_event(
            record,
            type_=body.type,
            now=proctoring_service.utcnow(),
            max_warnings=cfg.max_warnings,
            cooldown_seconds=cfg.strike_cooldown_seconds,
            flag_dedup_seconds=cfg.flag_dedup_seconds,
            metrics={**body.metrics, "client_ts": body.client_ts},
            snapshot=file_name,
            event_id=event_id,
        )

    record, decision = proctoring_service.mutate(conn, kind=kind, attempt_id=attempt_id, fn=apply)
    conn.commit()
    if file_name and decision.event_id is None:  # deduplicated: nothing references the file
        proctoring_service.delete_snapshot(settings, attempt_id=attempt_id, file_name=file_name)
    await proctoring_service.dispatch_decision(
        conn=conn,
        settings=settings,
        kind=kind,
        attempt_id=attempt_id,
        decision=decision,
        record=record,
    )
    return {
        "decision": decision.action,
        "strike": decision.strike,
        "counted": decision.counted,
        "warnings_used": decision.warnings_used,
        "message": policy.reason_message(body.type),
    }


async def _acknowledge(
    kind: str, attempt_id: str, body: AcknowledgeRequest, ctx: Any, conn: Connection
) -> dict:
    _load(conn, ctx, kind, attempt_id)
    now = proctoring_service.utcnow()
    try:
        proctoring_service.mutate(
            conn,
            kind=kind,
            attempt_id=attempt_id,
            fn=lambda r: policy.acknowledge(r, strike=body.strike, now=now),
        )
    except policy.PolicyError:
        conn.rollback()
        raise ApiError(
            status_code=409, code="no_pending_warning", message="There is no matching warning."
        ) from None
    conn.commit()
    await interview_manager.resume_after_proctoring(attempt_id)
    await proctoring_service._send_ws(attempt_id, {"type": "proctoring_resumed", "content": {}})
    return {"ok": True}


def _heartbeat(
    kind: str, attempt_id: str, body: HeartbeatRequest, ctx: Any, conn: Connection
) -> dict:
    attempt = _load(conn, ctx, kind, attempt_id)
    record = attempt.get("proctoring")
    if proctoring_service.enabled_for(conn, attempt, kind):
        now = proctoring_service.utcnow()
        record, _ = proctoring_service.mutate(
            conn, kind=kind, attempt_id=attempt_id, fn=lambda r: policy.heartbeat(r, now=now)
        )
        conn.commit()
    return {
        "ok": True,
        "pending_warning": (record or {}).get("pending_warning"),
        "terminated": policy.terminated_view(record),
    }


async def _enrolment(
    kind: str, attempt_id: str, file: UploadFile, ctx: Any, conn: Connection, settings: Settings
) -> dict:
    """Embed the device-check voice sample in memory. Never stores the audio."""
    _load(conn, ctx, kind, attempt_id)
    try:
        data = await file.read(_MAX_ENROLMENT_BYTES + 1)
    finally:
        await file.close()
    if len(data) > _MAX_ENROLMENT_BYTES:
        raise ApiError(status_code=422, code="invalid_sample", message="The sample is too large.")
    try:
        pcm = enrolment.decode_wav_pcm16_mono_16k(data)
    except ValueError as exc:
        raise ApiError(status_code=422, code="invalid_sample", message=str(exc)) from None
    finally:
        del data
    seconds = len(pcm) / enrolment.SAMPLE_RATE
    if not 5 <= seconds <= 20:
        raise ApiError(
            status_code=422,
            code="invalid_sample",
            message="The voice sample must be between 5 and 20 seconds long.",
        )
    embedder = await asyncio.to_thread(voice_proctoring.get_embedder, settings)
    if not embedder.available:
        return {"enrolled": False}
    try:
        embedding = await asyncio.to_thread(embedder.embed, pcm)
    except Exception as err:  # a model failure must never become a 5xx
        logger.warning(f"Voice enrolment failed for {attempt_id}: {type(err).__name__}")
        return {"enrolled": False}
    finally:
        del pcm
    enrolment.get_enrolment_registry().put(attempt_id, embedding, source="device_check")
    del embedding
    now = proctoring_service.utcnow()

    def enrolled(record: dict[str, Any]) -> None:
        record["voice"] = {"enrolled": True, "source": "device_check", "model": embedder.name}
        policy.record_session_event(record, type_="enrolment_completed", now=now)

    proctoring_service.mutate(conn, kind=kind, attempt_id=attempt_id, fn=enrolled)
    conn.commit()
    return {"enrolled": True}


# --- routes (both attempt kinds) ----------------------------------------------------


def _register(kind: str) -> None:
    base = _BASES[kind]

    @router.get(base, name=f"{kind}_proctoring_state")
    async def get_state(
        attempt_id: str,
        ctx: CandidateContextDependency,
        conn: DbDependency,
        settings: SettingsDependency,
    ) -> dict[str, Any]:
        return _get(kind, attempt_id, ctx, conn, settings)

    @router.post(f"{base}/consent", name=f"{kind}_proctoring_consent")
    async def consent(
        attempt_id: str,
        body: ConsentRequest,
        request: Request,
        ctx: CandidateContextDependency,
        conn: DbDependency,
        settings: SettingsDependency,
    ) -> dict[str, Any]:
        return _consent(kind, attempt_id, body, request, ctx, conn, settings)

    @router.post(f"{base}/calibration", name=f"{kind}_proctoring_calibration")
    async def calibration(
        attempt_id: str,
        body: CalibrationRequest,
        ctx: CandidateContextDependency,
        conn: DbDependency,
        settings: SettingsDependency,
    ) -> dict[str, Any]:
        return _calibration(kind, attempt_id, body, ctx, conn, settings)

    @router.post(f"{base}/events", name=f"{kind}_proctoring_event")
    async def event(
        attempt_id: str,
        body: EventRequest,
        ctx: CandidateContextDependency,
        conn: DbDependency,
        settings: SettingsDependency,
    ) -> dict[str, Any]:
        return await _event(kind, attempt_id, body, ctx, conn, settings)

    @router.post(f"{base}/acknowledge", name=f"{kind}_proctoring_acknowledge")
    async def acknowledge(
        attempt_id: str,
        body: AcknowledgeRequest,
        ctx: CandidateContextDependency,
        conn: DbDependency,
    ) -> dict[str, Any]:
        return await _acknowledge(kind, attempt_id, body, ctx, conn)

    @router.post(f"{base}/heartbeat", name=f"{kind}_proctoring_heartbeat")
    async def heartbeat(
        attempt_id: str,
        body: HeartbeatRequest,
        ctx: CandidateContextDependency,
        conn: DbDependency,
    ) -> dict[str, Any]:
        return _heartbeat(kind, attempt_id, body, ctx, conn)

    @router.post(f"{base}/enrolment", name=f"{kind}_proctoring_enrolment")
    async def enrol_voice(
        attempt_id: str,
        file: Annotated[UploadFile, File()],
        ctx: CandidateContextDependency,
        conn: DbDependency,
        settings: SettingsDependency,
    ) -> dict[str, Any]:
        return await _enrolment(kind, attempt_id, file, ctx, conn, settings)


for _kind in _BASES:
    _register(_kind)
