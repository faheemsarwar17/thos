import random
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.api.dependencies import (
    CandidateContextDependency,
    DbDependency,
    PackRegistryDependency,
    SettingsDependency,
)
from app.core.config import Settings
from app.core.errors import ApiError
from app.db import store
from app.db.database import Connection
from app.domain.evaluation import evaluate_scenario_responses
from app.schemas.cv import ProfileHints
from app.services.cv_extract import extract_cv_text
from app.services.cv_parse import parse_cv, profile_text_for_embedding
from app.services.embeddings import embed_text

router = APIRouter(tags=["candidates"])


def _public_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Strip grading keys before questions are sent to a candidate."""
    return [
        {"id": q["id"], "prompt": q["prompt"], "competency": q["competency"]} for q in questions
    ]


def _candidate_body(candidate: dict[str, Any]) -> dict[str, Any]:
    parsed = candidate.get("parsed_cv")
    return {
        "id": candidate["id"],
        "profile": candidate["profile"],
        "consents": candidate["consents"],
        "target_domains": candidate["target_domains"],
        "updated_at": candidate["updated_at"],
        "parsed_cv": parsed,
        "embedding_model": candidate.get("embedding_model"),
        "embedded_at": candidate.get("embedded_at"),
        "has_embedding": bool(candidate.get("embedding")),
    }


def _refresh_candidate_embedding(
    conn: Connection,
    *,
    candidate_id: str,
    profile: dict[str, Any],
    parsed_cv: dict[str, Any] | None,
    settings: Settings,
) -> dict[str, Any]:
    vector, model = embed_text(
        profile_text_for_embedding(profile, parsed_cv),
        settings=settings,
    )
    now = datetime.now(UTC).isoformat()
    store.update_candidate(
        conn,
        candidate_id=candidate_id,
        embedding=vector,
        embedding_model=model,
        embedded_at=now,
    )
    return {"embedding_model": model, "embedded_at": now, "has_embedding": True}


def _apply_hints_to_profile(profile: dict[str, Any], hints: ProfileHints) -> dict[str, Any]:
    updated = dict(profile)
    if hints.headline and not updated.get("headline"):
        updated["headline"] = hints.headline
    if hints.summary and not updated.get("summary"):
        updated["summary"] = hints.summary
    if hints.skills:
        existing = {skill.lower() for skill in updated.get("skills") or []}
        merged = list(updated.get("skills") or [])
        for skill in hints.skills:
            if skill.lower() not in existing:
                merged.append(skill)
                existing.add(skill.lower())
        updated["skills"] = merged[:40]
    if hints.credentials:
        existing = {item.lower() for item in updated.get("credentials") or []}
        merged = list(updated.get("credentials") or [])
        for item in hints.credentials:
            if item.lower() not in existing:
                merged.append(item)
                existing.add(item.lower())
        updated["credentials"] = merged[:20]
    if hints.experiences:
        existing = {item.lower() for item in updated.get("experiences") or []}
        merged = list(updated.get("experiences") or [])
        for item in hints.experiences:
            if item.lower() not in existing:
                merged.append(item)
                existing.add(item.lower())
        updated["experiences"] = merged[:20]
    return updated


async def _persist_parsed_cv(
    *,
    conn: Connection,
    candidate: dict[str, Any],
    settings: Settings,
    text: str,
    source_filename: str | None,
    apply_to_profile: bool,
) -> dict[str, Any]:
    parsed, hints = await parse_cv(
        text,
        settings=settings,
        source_filename=source_filename,
    )
    profile = dict(candidate["profile"])
    if apply_to_profile:
        profile = _apply_hints_to_profile(profile, hints)

    parsed_dict = parsed.model_dump()
    store.update_candidate(
        conn,
        candidate_id=candidate["id"],
        profile=profile,
        parsed_cv=parsed_dict,
    )
    embedding_meta = _refresh_candidate_embedding(
        conn,
        candidate_id=candidate["id"],
        profile=profile,
        parsed_cv=parsed_dict,
        settings=settings,
    )
    conn.commit()
    refreshed = store.get_candidate(conn, candidate["id"])
    return {
        "candidate": _candidate_body(refreshed),  # type: ignore[arg-type]
        "parsed_cv": parsed_dict,
        "hints": hints.model_dump(),
        "embedding": embedding_meta,
    }


@router.get("/candidates/me/profile")
async def get_my_profile(context: CandidateContextDependency) -> dict[str, Any]:
    return {"candidate": _candidate_body(context.candidate)}


class ProfileUpdateRequest(BaseModel):
    headline: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=4000)
    skills: list[str] | None = Field(default=None, max_length=50)
    credentials: list[str] | None = Field(default=None, max_length=25)
    experiences: list[str] | None = Field(default=None, max_length=25)
    availability: str | None = Field(default=None, max_length=100)
    target_domains: list[str] | None = Field(default=None, max_length=10)


@router.patch("/candidates/me/profile")
async def update_my_profile(
    payload: ProfileUpdateRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    profile = dict(context.candidate["profile"])
    for field in ("headline", "summary", "skills", "credentials", "experiences", "availability"):
        value = getattr(payload, field)
        if value is not None:
            profile[field] = value
    store.update_candidate(
        conn,
        candidate_id=context.candidate["id"],
        profile=profile,
        target_domains=payload.target_domains,
    )
    _refresh_candidate_embedding(
        conn,
        candidate_id=context.candidate["id"],
        profile=profile,
        parsed_cv=context.candidate.get("parsed_cv"),
        settings=settings,
    )
    conn.commit()
    candidate = store.get_candidate(conn, context.candidate["id"])
    return {"candidate": _candidate_body(candidate)}  # type: ignore[arg-type]


class CvParseRequest(BaseModel):
    text: str = Field(min_length=40, max_length=100_000)
    source_filename: str | None = Field(default=None, max_length=255)
    apply_to_profile: bool = True


@router.post("/candidates/me/cv/parse")
async def parse_my_cv(
    payload: CvParseRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    """Parse CV text once into structured sections, then embed for matching."""
    return await _persist_parsed_cv(
        conn=conn,
        candidate=context.candidate,
        settings=settings,
        text=payload.text,
        source_filename=payload.source_filename,
        apply_to_profile=payload.apply_to_profile,
    )


@router.post("/candidates/me/cv/upload")
async def upload_my_cv(
    conn: DbDependency,
    context: CandidateContextDependency,
    settings: SettingsDependency,
    file: UploadFile = File(...),
    apply_to_profile: bool = Form(True),
) -> dict[str, Any]:
    """Extract text from PDF/DOCX/TXT, parse once, then embed for matching."""
    data = await file.read()
    text, fmt = extract_cv_text(
        data=data,
        filename=file.filename,
        content_type=file.content_type,
    )
    result = await _persist_parsed_cv(
        conn=conn,
        candidate=context.candidate,
        settings=settings,
        text=text,
        source_filename=file.filename or f"cv.{fmt}",
        apply_to_profile=apply_to_profile,
    )
    result["source_format"] = fmt
    result["extracted_chars"] = len(text)
    return result


class ConsentRequest(BaseModel):
    granted: bool


@router.put("/candidates/me/consents/{purpose}")
async def set_consent(
    purpose: str,
    payload: ConsentRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
) -> dict[str, Any]:
    if purpose not in ("discovery", "application_processing"):
        raise ApiError(
            status_code=422,
            code="unknown_consent_purpose",
            message="Consent purpose must be 'discovery' or 'application_processing'.",
        )
    consents = dict(context.candidate["consents"])
    consents[purpose] = payload.granted
    store.update_candidate(conn, candidate_id=context.candidate["id"], consents=consents)
    conn.commit()
    return {"consents": consents}


@router.get("/candidates/me/profile-interview-attempts")
async def list_my_attempts(
    conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    attempts = store.list_profile_attempts(conn, candidate_id=context.candidate["id"])
    return {
        "attempts": [
            {
                "id": a["id"],
                "pack_id": a["pack_id"],
                "pack_version": a["pack_version"],
                "attempt_number": a["attempt_number"],
                "status": a["status"],
                "started_at": a["started_at"],
                "submitted_at": a["submitted_at"],
                "overall_score": (a.get("evaluation") or {}).get("overall_score"),
            }
            for a in attempts
        ]
    }


class StartAttemptRequest(BaseModel):
    pack_id: str = Field(min_length=1, max_length=100)


@router.post("/candidates/me/profile-interview-attempts", status_code=201)
async def start_profile_attempt(
    payload: StartAttemptRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
    registry: PackRegistryDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    attempts = store.list_profile_attempts(conn, candidate_id=context.candidate["id"])
    in_progress = next((a for a in attempts if a["status"] == "in_progress"), None)
    if in_progress:
        # Session recovery: resume the open attempt instead of duplicating it.
        return {
            "attempt": {
                "id": in_progress["id"],
                "status": in_progress["status"],
                "attempt_number": in_progress["attempt_number"],
                "questions": _public_questions(in_progress["questions"]),
                "responses": in_progress["responses"],
                "resumed": True,
            }
        }

    pack_attempts = [a for a in attempts if a["pack_id"] == payload.pack_id]
    if len(pack_attempts) >= settings.profile_interview_attempt_cap:
        raise ApiError(
            status_code=409,
            code="attempt_cap_reached",
            message=(
                f"You have used all {settings.profile_interview_attempt_cap} attempts "
                "for this domain."
            ),
        )
    if pack_attempts:
        last = max(pack_attempts, key=lambda a: a["started_at"])
        started = datetime.fromisoformat(last["started_at"])
        cooldown = timedelta(hours=settings.profile_interview_cooldown_hours)
        remaining = started + cooldown - datetime.now(UTC)
        if remaining > timedelta(0):
            hours = max(1, int(remaining.total_seconds() // 3600))
            raise ApiError(
                status_code=409,
                code="attempt_cooldown_active",
                message=f"You can retake this interview in about {hours} hour(s).",
            )

    manifest = registry.load(payload.pack_id)
    block = manifest["profile_interview"]
    count = min(block.get("question_count", 4), len(block["questions"]))
    questions = random.sample(block["questions"], count)
    attempt = store.create_profile_attempt(
        conn,
        candidate_id=context.candidate["id"],
        pack_id=manifest["pack_id"],
        pack_version=manifest["pack_version"],
        attempt_number=len(pack_attempts) + 1,
        questions=questions,
    )
    conn.commit()
    return {
        "attempt": {
            "id": attempt["id"],
            "status": attempt["status"],
            "attempt_number": attempt["attempt_number"],
            "questions": _public_questions(attempt["questions"]),
            "responses": {},
            "resumed": False,
        }
    }


@router.get("/profile-interview-attempts/{attempt_id}")
async def get_profile_attempt(
    attempt_id: str, conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    attempt = store.get_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=context.candidate["id"]
    )
    if attempt is None:
        raise ApiError(status_code=404, code="not_found", message="Interview attempt not found.")
    return {
        "attempt": {
            "id": attempt["id"],
            "status": attempt["status"],
            "attempt_number": attempt["attempt_number"],
            "questions": _public_questions(attempt["questions"]),
            "responses": attempt["responses"],
            "evaluation": attempt.get("evaluation"),
            "started_at": attempt["started_at"],
            "submitted_at": attempt["submitted_at"],
        }
    }


class SaveResponsesRequest(BaseModel):
    responses: dict[str, str]


@router.patch("/profile-interview-attempts/{attempt_id}/responses")
async def save_responses(
    attempt_id: str,
    payload: SaveResponsesRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
) -> dict[str, Any]:
    attempt = store.get_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=context.candidate["id"]
    )
    if attempt is None:
        raise ApiError(status_code=404, code="not_found", message="Interview attempt not found.")
    if attempt["status"] != "in_progress":
        raise ApiError(
            status_code=409,
            code="attempt_already_submitted",
            message="This attempt was already submitted and can no longer change.",
        )
    known_ids = {q["id"] for q in attempt["questions"]}
    merged = dict(attempt["responses"])
    for question_id, text in payload.responses.items():
        if question_id not in known_ids:
            raise ApiError(
                status_code=422,
                code="unknown_question",
                message=f"Question '{question_id}' is not part of this attempt.",
            )
        merged[question_id] = text[:20000]
    store.save_profile_attempt_responses(conn, attempt_id=attempt_id, responses=merged)
    conn.commit()
    return {"saved": True, "responses": merged}


class SubmitAttemptRequest(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=128)


@router.post("/profile-interview-attempts/{attempt_id}/submit")
async def submit_profile_attempt(
    attempt_id: str,
    payload: SubmitAttemptRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
) -> dict[str, Any]:
    attempt = store.get_profile_attempt(
        conn, attempt_id=attempt_id, candidate_id=context.candidate["id"]
    )
    if attempt is None:
        raise ApiError(status_code=404, code="not_found", message="Interview attempt not found.")

    cached = store.find_idempotent_response(
        conn, key=payload.idempotency_key, tenant_id=context.candidate["id"], operation="submit_pia"
    )
    if cached:
        return cached
    if attempt["status"] != "in_progress":
        raise ApiError(
            status_code=409,
            code="attempt_already_submitted",
            message="This attempt was already submitted.",
        )

    # The stored manifest snapshot on the attempt keeps grading pinned to
    # the exact question and rubric versions the candidate saw.
    evaluation = evaluate_scenario_responses(
        questions=attempt["questions"],
        responses=attempt["responses"],
        rubric_dimensions=[
            {"id": "structure", "label": "Structure"},
            {"id": "reasoning", "label": "Reasoning"},
            {"id": "domain_correctness", "label": "Domain correctness"},
        ],
        pack_id=attempt["pack_id"],
        pack_version=attempt["pack_version"],
    )
    store.submit_profile_attempt(conn, attempt_id=attempt_id, evaluation=evaluation)
    body = {
        "attempt_id": attempt_id,
        "status": "evaluated",
        "evaluation": evaluation,
    }
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.candidate["id"],
        operation="submit_pia",
        body=body,
    )
    conn.commit()
    return body
