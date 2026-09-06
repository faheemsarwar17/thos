import random
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import (
    PIPELINE_ROLES,
    CorrelationIdDependency,
    DbDependency,
    EmployerContextDependency,
    PackRegistryDependency,
    SettingsDependency,
    require_role,
)
from app.api.v1.packs import resolve_pack_manifest
from app.core.errors import ApiError
from app.core.ids import new_id
from app.db import store
from app.db.database import utc_now
from app.services.job_description import generate_ai_job_description
from app.services.matching import run_posting_matching

router = APIRouter(tags=["postings"])


def _posting_body(posting: dict[str, Any], application_count: int | None = None) -> dict[str, Any]:
    body = {
        "id": posting["id"],
        "title": posting["title"],
        "description": posting["description"],
        "location": posting["location"],
        "work_mode": posting.get("work_mode", "hybrid"),
        "employment_type": posting["employment_type"],
        "status": posting["status"],
        "unit_id": posting["unit_id"],
        "pack_id": posting["pack_id"],
        "pack_version": posting["pack_version"],
        "pool_status": posting["pool_status"],
        "question_pool": posting.get("question_pool"),
        "workflow_snapshot": posting.get("workflow_snapshot"),
        "sandbox_required": bool(posting.get("sandbox_required")),
        "sandbox": posting.get("sandbox_config"),
        "created_at": posting["created_at"],
        "published_at": posting["published_at"],
        "closed_at": posting["closed_at"],
    }
    if application_count is not None:
        body["application_count"] = application_count
    return body


@router.get("/postings")
async def list_postings(conn: DbDependency, context: EmployerContextDependency) -> dict[str, Any]:
    postings = store.list_postings(conn, tenant_id=context.tenant_id)
    applications = store.list_applications_for_tenant(conn, tenant_id=context.tenant_id)
    counts: dict[str, int] = {}
    for application in applications:
        counts[application["posting_id"]] = counts.get(application["posting_id"], 0) + 1
    return {"postings": [_posting_body(p, counts.get(p["id"], 0)) for p in postings]}


@router.get("/postings/{posting_id}")
async def get_posting(
    posting_id: str, conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    applications = store.list_applications_for_tenant(
        conn, tenant_id=context.tenant_id, posting_id=posting_id
    )
    return {"posting": _posting_body(posting, len(applications))}


class SandboxConfig(BaseModel):
    """Proctored sandbox settings chosen when creating a job posting."""

    type: Literal["coding", "written"]
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    time_limit_minutes: int = Field(default=30, ge=5, le=120)


def _default_sandbox_config(pack_id: str | None) -> dict[str, Any]:
    """Default sandbox config: type inferred from the pinned pack's id."""
    hint = (pack_id or "").lower()
    sandbox_type: Literal["coding", "written"] = (
        "coding"
        if any(token in hint for token in ("software", "engineer", "dev", "tech"))
        else "written"
    )
    return SandboxConfig(type=sandbox_type).model_dump()


class CreatePostingRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=20000)
    location: str = Field(default="", max_length=200)
    work_mode: str = Field(default="hybrid", max_length=50)
    employment_type: str = Field(default="full_time", max_length=50)
    unit_id: str | None = None
    pack_id: str | None = Field(default=None, min_length=1, max_length=100)
    sandbox_required: bool = False
    sandbox: SandboxConfig | None = None
    idempotency_key: str = Field(min_length=1, max_length=128)


@router.post("/postings", status_code=201)
async def create_posting(
    payload: CreatePostingRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    cached = store.find_idempotent_response(
        conn, key=payload.idempotency_key, tenant_id=context.tenant_id, operation="create_posting"
    )
    if cached:
        return cached

    if payload.unit_id is not None:
        unit = store.get_unit(conn, tenant_id=context.tenant_id, unit_id=payload.unit_id)
        if unit is None:
            raise ApiError(
                status_code=422, code="invalid_unit", message="That unit does not exist."
            )

    # Pin pack + workflow at creation time (rules.md §11.3).
    pack_manifest: dict[str, Any] | None = None
    if payload.pack_id:
        pack_manifest, _source = resolve_pack_manifest(
            conn,
            tenant_id=context.tenant_id,
            pack_id=payload.pack_id,
            registry=registry,
        )
    else:
        active = store.get_active_pack(conn, tenant_id=context.tenant_id)
        if active:
            pack_manifest = active["manifest"]

    if pack_manifest is None:
        raise ApiError(
            status_code=422,
            code="domain_pack_required",
            message="Select a domain pack when creating a job.",
        )

    workflow = store.get_or_create_company_workflow(
        conn, tenant_id=context.tenant_id, actor_user_id=context.user["id"]
    )
    posting = {
        "id": new_id("pst"),
        "tenant_id": context.tenant_id,
        "unit_id": payload.unit_id,
        "title": payload.title,
        "description": payload.description,
        "location": payload.location,
        "work_mode": payload.work_mode,
        "employment_type": payload.employment_type,
        "status": "draft",
        "pack_id": pack_manifest["pack_id"],
        "pack_version": pack_manifest["pack_version"],
        "workflow_version_id": workflow["id"],
        "workflow_snapshot": {
            "stages": workflow["stages"],
            "candidate_status_mapping": workflow["candidate_status_mapping"],
            "version": workflow["version"],
        },
        "question_pool": None,
        "pool_status": "not_generated",
        "sandbox_required": payload.sandbox_required,
        "sandbox_config": (
            (payload.sandbox.model_dump() if payload.sandbox else None)
            or (
                _default_sandbox_config(pack_manifest["pack_id"])
                if payload.sandbox_required
                else None
            )
        ),
        "created_by": context.user["id"],
        "created_at": utc_now(),
        "published_at": None,
        "closed_at": None,
        "version": 1,
    }
    stored = store.create_posting(conn, posting)
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="posting.created",
        resource_type="posting",
        resource_id=posting["id"],
        new_state={"title": payload.title, "status": "draft"},
    )
    store.emit_event(
        conn,
        event_name="POSTING_CREATED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="posting",
        resource_id=posting["id"],
    )
    body = {"posting": _posting_body(stored, 0)}
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.tenant_id,
        operation="create_posting",
        body=body,
    )
    conn.commit()
    return body


class UpdatePostingRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    location: str | None = Field(default=None, max_length=200)
    work_mode: str | None = Field(default=None, max_length=50)
    employment_type: str | None = Field(default=None, max_length=50)
    sandbox_required: bool | None = None
    sandbox: SandboxConfig | None = None


@router.patch("/postings/{posting_id}")
async def update_posting(
    posting_id: str,
    payload: UpdatePostingRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    if posting["status"] not in ("draft",):
        raise ApiError(
            status_code=409,
            code="posting_not_editable",
            message="Only draft postings can be edited. Close and recreate a published posting.",
        )
    fields = {
        key: value
        for key, value in payload.model_dump(
            exclude={"sandbox_required", "sandbox"}
        ).items()
        if value is not None
    }
    if payload.sandbox_required is not None:
        fields["sandbox_required"] = payload.sandbox_required
    if payload.sandbox is not None:
        fields["sandbox_config"] = payload.sandbox.model_dump()
    # Enabling the sandbox without an explicit config falls back to defaults.
    if fields.get("sandbox_required") and "sandbox_config" not in fields:
        fields["sandbox_config"] = posting.get("sandbox_config") or _default_sandbox_config(
            posting.get("pack_id")
        )
    if fields:
        store.update_posting(
            conn, tenant_id=context.tenant_id, posting_id=posting_id, fields=fields
        )
        store.write_audit(
            conn,
            tenant_id=context.tenant_id,
            actor_user_id=context.user["id"],
            action="posting.updated",
            resource_type="posting",
            resource_id=posting_id,
            old_state={key: posting[key] for key in fields},
            new_state=fields,
        )
        conn.commit()
    updated = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    return {"posting": _posting_body(updated)}  # type: ignore[arg-type]


@router.post("/postings/{posting_id}/publish")
async def publish_posting(
    posting_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    if posting["status"] != "draft":
        raise ApiError(
            status_code=409,
            code="posting_not_draft",
            message=f"This posting is already {posting['status']}.",
        )
    if posting["workflow_snapshot"] is None:
        raise ApiError(
            status_code=422,
            code="workflow_required",
            message="Publish a hiring workflow before publishing a job.",
        )
    if posting["pool_status"] != "locked":
        raise ApiError(
            status_code=422,
            code="question_pool_not_locked",
            message="Lock the Applied Interview question pool before publishing this job.",
        )
    store.update_posting(
        conn,
        tenant_id=context.tenant_id,
        posting_id=posting_id,
        fields={"status": "published", "published_at": utc_now()},
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="posting.published",
        resource_type="posting",
        resource_id=posting_id,
        old_state={"status": "draft"},
        new_state={"status": "published"},
    )
    store.emit_event(
        conn,
        event_name="POSTING_PUBLISHED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="posting",
        resource_id=posting_id,
    )

    matches: list[dict[str, Any]] = []
    if posting.get("pack_id"):
        try:
            manifest, _source = resolve_pack_manifest(
                conn,
                tenant_id=context.tenant_id,
                pack_id=posting["pack_id"],
                registry=registry,
            )
            published = store.get_posting(
                conn, tenant_id=context.tenant_id, posting_id=posting_id
            )
            matches = run_posting_matching(
                conn,
                tenant_id=context.tenant_id,
                posting=published or posting,
                manifest=manifest,
                notify=True,
            )
            store.emit_event(
                conn,
                event_name="POSTING_MATCHES_GENERATED",
                tenant_id=context.tenant_id,
                actor_user_id=context.user["id"],
                correlation_id=correlation_id,
                resource_type="posting",
                resource_id=posting_id,
                payload={"match_count": len(matches)},
            )
        except ApiError:
            # Publishing still succeeds if matching cannot resolve the pack.
            matches = []

    conn.commit()
    updated = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    return {
        "posting": _posting_body(updated),  # type: ignore[arg-type]
        "matches": {
            "count": len(matches),
            "top_score": matches[0]["score"] if matches else None,
        },
    }


@router.get("/postings/{posting_id}/matches")
async def list_posting_matches(
    posting_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    matches = store.list_posting_matches(
        conn, tenant_id=context.tenant_id, posting_id=posting_id
    )
    return {"posting_id": posting_id, "matches": matches, "count": len(matches)}


@router.post("/postings/{posting_id}/close")
async def close_posting(
    posting_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    if posting["status"] == "closed":
        raise ApiError(
            status_code=409, code="posting_already_closed", message="This posting is closed."
        )
    store.update_posting(
        conn,
        tenant_id=context.tenant_id,
        posting_id=posting_id,
        fields={"status": "closed", "closed_at": utc_now()},
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="posting.closed",
        resource_type="posting",
        resource_id=posting_id,
        old_state={"status": posting["status"]},
        new_state={"status": "closed"},
    )
    store.emit_event(
        conn,
        event_name="POSTING_CLOSED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="posting",
        resource_id=posting_id,
    )
    conn.commit()
    updated = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    return {"posting": _posting_body(updated)}  # type: ignore[arg-type]


# --- question pool -----------------------------------------------------------


@router.post("/postings/{posting_id}/question-pool/generate")
async def generate_question_pool(
    posting_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    if posting["pool_status"] == "locked":
        raise ApiError(
            status_code=409,
            code="question_pool_locked",
            message="The question pool is locked and can no longer be regenerated.",
        )
    if not posting.get("pack_id"):
        raise ApiError(
            status_code=422,
            code="domain_pack_required",
            message="This job has no domain pack pinned. Create a new job with a pack selected.",
        )
    # Generation draws from the pack pinned to this posting; the engine
    # itself contains no question content (rules.md §1.1).
    manifest, _source = resolve_pack_manifest(
        conn,
        tenant_id=context.tenant_id,
        pack_id=posting["pack_id"],
        registry=registry,
    )
    block = manifest["applied_interview"]
    count = min(block.get("question_count", 4), len(block["questions"]))
    questions = random.sample(block["questions"], count)
    pool = {
        "version": 1,
        "status": "generated",
        "task_style": block.get("task_style", "scenario"),
        "questions": questions,
        "rubric_dimensions": manifest["evaluation_rubric"]["dimensions"],
        "generated_at": utc_now(),
    }
    store.update_posting(
        conn,
        tenant_id=context.tenant_id,
        posting_id=posting_id,
        fields={"question_pool": pool, "pool_status": "generated"},
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="question_pool.generated",
        resource_type="posting",
        resource_id=posting_id,
        new_state={"question_count": len(questions)},
    )
    conn.commit()
    return {"question_pool": pool}


class CuratePoolRequest(BaseModel):
    questions: list[dict[str, Any]] = Field(min_length=1, max_length=25)


@router.patch("/postings/{posting_id}/question-pool")
async def curate_question_pool(
    posting_id: str,
    payload: CuratePoolRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    pool = posting.get("question_pool")
    if pool is None or posting["pool_status"] == "not_generated":
        raise ApiError(
            status_code=409,
            code="question_pool_missing",
            message="Generate the question pool before curating it.",
        )
    if posting["pool_status"] == "locked":
        raise ApiError(
            status_code=409,
            code="question_pool_locked",
            message="The question pool is locked and immutable.",
        )
    for question in payload.questions:
        for key in ("id", "prompt", "competency"):
            if not question.get(key):
                raise ApiError(
                    status_code=422,
                    code="invalid_question",
                    message=f"Every question needs an '{key}'.",
                )
    pool = dict(pool)
    pool["questions"] = payload.questions
    pool["status"] = "curated"
    store.update_posting(
        conn,
        tenant_id=context.tenant_id,
        posting_id=posting_id,
        fields={"question_pool": pool, "pool_status": "curated"},
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="question_pool.curated",
        resource_type="posting",
        resource_id=posting_id,
        new_state={"question_count": len(payload.questions)},
    )
    conn.commit()
    return {"question_pool": pool}


@router.post("/postings/{posting_id}/question-pool/lock")
async def lock_question_pool(
    posting_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Posting not found.")
    pool = posting.get("question_pool")
    if pool is None:
        raise ApiError(
            status_code=409,
            code="question_pool_missing",
            message="Generate and review the question pool before locking it.",
        )
    if posting["pool_status"] == "locked":
        raise ApiError(
            status_code=409,
            code="question_pool_locked",
            message="The question pool is already locked.",
        )
    pool = dict(pool)
    pool["status"] = "locked"
    pool["locked_at"] = utc_now()
    store.update_posting(
        conn,
        tenant_id=context.tenant_id,
        posting_id=posting_id,
        fields={"question_pool": pool, "pool_status": "locked"},
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="question_pool.locked",
        resource_type="posting",
        resource_id=posting_id,
        new_state={"version": pool["version"], "question_count": len(pool["questions"])},
    )
    store.emit_event(
        conn,
        event_name="QUESTION_POOL_LOCKED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="posting",
        resource_id=posting_id,
        payload={"pool_version": pool["version"]},
    )
    conn.commit()
    return {"question_pool": pool}


class GenerateJobDescriptionRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    work_mode: str | None = Field(default="hybrid", max_length=50)
    pack_id: str | None = Field(default=None, max_length=100)
    employment_type: str | None = Field(default="full_time", max_length=50)
    notes: str | None = Field(default=None, max_length=2000)


@router.post("/postings/generate-description")
async def generate_job_description_endpoint(
    payload: GenerateJobDescriptionRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    pack_manifest: dict[str, Any] | None = None
    if payload.pack_id:
        try:
            pack_manifest, _ = resolve_pack_manifest(
                conn,
                tenant_id=context.tenant_id,
                pack_id=payload.pack_id,
                registry=registry,
            )
        except Exception:
            pack_manifest = None

    if not pack_manifest:
        active = store.get_active_pack(conn, tenant_id=context.tenant_id)
        if active:
            pack_manifest = active.get("manifest")

    description = await generate_ai_job_description(
        title=payload.title,
        location=payload.location,
        work_mode=payload.work_mode,
        pack_manifest=pack_manifest,
        employment_type=payload.employment_type,
        notes=payload.notes,
        settings=settings,
    )
    return {"description": description}

