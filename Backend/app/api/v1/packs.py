from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import (
    ADMIN_ROLES,
    CorrelationIdDependency,
    DbDependency,
    EmployerContextDependency,
    PackRegistryDependency,
    require_role,
)
from app.core.errors import ApiError
from app.db import store
from app.services.packs import PackRegistry, PackValidationError, validate_manifest

router = APIRouter(tags=["domain-packs"])


def _pack_summary(
    manifest: dict[str, Any],
    *,
    source: str,
    linked_jobs: int | None = None,
) -> dict[str, Any]:
    body = {
        "pack_id": manifest["pack_id"],
        "pack_version": manifest["pack_version"],
        "display_name": manifest["display_name"],
        "domain": manifest.get("domain", ""),
        "skills": manifest["ontology"].get("skills", [])[:8],
        "rubric_dimensions": manifest["evaluation_rubric"]["dimensions"],
        "source": source,
    }
    if linked_jobs is not None:
        body["linked_jobs"] = linked_jobs
    return body


def resolve_pack_manifest(
    conn: Any,
    *,
    tenant_id: str,
    pack_id: str,
    registry: PackRegistry,
) -> tuple[dict[str, Any], str]:
    try:
        return registry.load(pack_id), "builtin"
    except ApiError as exc:
        if exc.code != "domain_pack_not_found":
            raise
    custom = store.get_tenant_pack(conn, tenant_id=tenant_id, pack_id=pack_id)
    if custom is None:
        raise ApiError(
            status_code=404,
            code="domain_pack_not_found",
            message=f"No domain pack named '{pack_id}' is installed.",
        )
    return custom["manifest"], "custom"


@router.get("/domain-packs")
async def list_domain_packs(
    conn: DbDependency,
    registry: PackRegistryDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    packs = []
    for manifest in registry.available_packs():
        linked = store.count_postings_for_pack(
            conn, tenant_id=context.tenant_id, pack_id=manifest["pack_id"]
        )
        packs.append(_pack_summary(manifest, source="builtin", linked_jobs=linked))
    seen = {pack["pack_id"] for pack in packs}
    for custom in store.list_tenant_packs(conn, tenant_id=context.tenant_id):
        if custom["pack_id"] in seen:
            continue
        linked = store.count_postings_for_pack(
            conn, tenant_id=context.tenant_id, pack_id=custom["pack_id"]
        )
        packs.append(_pack_summary(custom["manifest"], source="custom", linked_jobs=linked))
    return {"packs": packs}


@router.get("/domain-packs/{pack_id}")
async def get_domain_pack(
    pack_id: str,
    conn: DbDependency,
    registry: PackRegistryDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    manifest, source = resolve_pack_manifest(
        conn, tenant_id=context.tenant_id, pack_id=pack_id, registry=registry
    )
    linked = store.count_postings_for_pack(
        conn, tenant_id=context.tenant_id, pack_id=pack_id
    )
    return {
        "pack": {
            **_pack_summary(manifest, source=source, linked_jobs=linked),
            "manifest": manifest,
        }
    }


class QuestionInput(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    prompt: str = Field(min_length=8, max_length=2000)
    competency: str = Field(min_length=1, max_length=120)
    expected_concepts: list[str] = Field(default_factory=list)


class RubricDimensionInput(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    label: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


class CreateDomainPackRequest(BaseModel):
    pack_id: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9_-]*$")
    pack_version: str = Field(default="1.0.0", min_length=5, max_length=20)
    display_name: str = Field(min_length=2, max_length=120)
    domain: str = Field(default="", max_length=200)
    skills: list[str] = Field(min_length=1)
    certifications: list[str] = Field(default_factory=list)
    concepts: list[str] = Field(default_factory=list)
    profile_questions: list[QuestionInput] = Field(min_length=1)
    applied_questions: list[QuestionInput] = Field(min_length=1)
    rubric_dimensions: list[RubricDimensionInput] | None = None
    profile_task_style: str = Field(default="scenario")
    applied_task_style: str = Field(default="scenario")
    matching_weights: dict[str, float] | None = None


class UpdateDomainPackRequest(BaseModel):
    pack_version: str | None = Field(default=None, min_length=5, max_length=20)
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    domain: str | None = Field(default=None, max_length=200)
    skills: list[str] | None = Field(default=None, min_length=1)
    certifications: list[str] | None = None
    concepts: list[str] | None = None
    profile_questions: list[QuestionInput] | None = Field(default=None, min_length=1)
    applied_questions: list[QuestionInput] | None = Field(default=None, min_length=1)
    rubric_dimensions: list[RubricDimensionInput] | None = None
    profile_task_style: str | None = None
    applied_task_style: str | None = None
    matching_weights: dict[str, float] | None = None


def _build_manifest(
    *,
    pack_id: str,
    pack_version: str,
    display_name: str,
    domain: str,
    skills: list[str],
    certifications: list[str],
    concepts: list[str],
    profile_questions: list[QuestionInput],
    applied_questions: list[QuestionInput],
    rubric_dimensions: list[RubricDimensionInput] | None,
    profile_task_style: str,
    applied_task_style: str,
    matching_weights: dict[str, float] | None,
) -> dict[str, Any]:
    dimensions = rubric_dimensions or [
        RubricDimensionInput(
            id="structure",
            label="Structure",
            description="The response is organised, sequenced, and complete.",
        ),
        RubricDimensionInput(
            id="reasoning",
            label="Reasoning",
            description="Decisions are justified with cause-and-effect thinking.",
        ),
        RubricDimensionInput(
            id="domain_correctness",
            label="Domain correctness",
            description="The response uses correct domain practice and terminology.",
        ),
    ]
    return {
        "pack_id": pack_id,
        "pack_version": pack_version,
        "display_name": display_name,
        "domain": domain,
        "ontology": {
            "skills": [skill.strip() for skill in skills if skill.strip()],
            "certifications": [item.strip() for item in certifications if item.strip()],
            "concepts": [item.strip() for item in concepts if item.strip()],
        },
        "resume_extraction_rules": {"signals": []},
        "matching_weights": matching_weights
        or {"cv_match": 0.4, "profile_interview_score": 0.6},
        "profile_interview": {
            "task_style": profile_task_style,
            "question_count": min(4, len(profile_questions)),
            "questions": [question.model_dump() for question in profile_questions],
        },
        "applied_interview": {
            "task_style": applied_task_style,
            "question_count": min(4, len(applied_questions)),
            "questions": [question.model_dump() for question in applied_questions],
        },
        "evaluation_rubric": {
            "dimensions": [dimension.model_dump() for dimension in dimensions],
        },
        "compliance_rules": [],
    }


def _bump_patch_version(version: str) -> str:
    parts = version.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        return "1.0.1"
    major, minor, patch = (int(part) for part in parts)
    return f"{major}.{minor}.{patch + 1}"


@router.post("/domain-packs", status_code=201)
async def create_domain_pack(
    payload: CreateDomainPackRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, ADMIN_ROLES)
    if any(pack["pack_id"] == payload.pack_id for pack in registry.available_packs()):
        raise ApiError(
            status_code=409,
            code="pack_id_reserved",
            message=f"Pack id '{payload.pack_id}' is reserved by a built-in pack.",
        )
    if store.get_tenant_pack(conn, tenant_id=context.tenant_id, pack_id=payload.pack_id):
        raise ApiError(
            status_code=409,
            code="pack_already_exists",
            message=f"A custom pack named '{payload.pack_id}' already exists for this organization.",
        )

    manifest = _build_manifest(
        pack_id=payload.pack_id,
        pack_version=payload.pack_version,
        display_name=payload.display_name,
        domain=payload.domain,
        skills=payload.skills,
        certifications=payload.certifications,
        concepts=payload.concepts,
        profile_questions=payload.profile_questions,
        applied_questions=payload.applied_questions,
        rubric_dimensions=payload.rubric_dimensions,
        profile_task_style=payload.profile_task_style,
        applied_task_style=payload.applied_task_style,
        matching_weights=payload.matching_weights,
    )
    try:
        validate_manifest(manifest)
    except PackValidationError:
        raise

    created = store.create_tenant_pack(
        conn,
        tenant_id=context.tenant_id,
        manifest=manifest,
        actor_user_id=context.user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="domain_pack.created",
        resource_type="domain_pack",
        resource_id=manifest["pack_id"],
        new_state={
            "pack_id": manifest["pack_id"],
            "pack_version": manifest["pack_version"],
            "source": "custom",
        },
    )
    conn.commit()
    return {"pack": _pack_summary(created["manifest"], source="custom", linked_jobs=0)}


@router.patch("/domain-packs/{pack_id}")
async def update_domain_pack(
    pack_id: str,
    payload: UpdateDomainPackRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, ADMIN_ROLES)
    if any(pack["pack_id"] == pack_id for pack in registry.available_packs()):
        raise ApiError(
            status_code=409,
            code="pack_immutable",
            message="Built-in domain packs cannot be edited.",
        )
    existing = store.get_tenant_pack(conn, tenant_id=context.tenant_id, pack_id=pack_id)
    if existing is None:
        raise ApiError(
            status_code=404,
            code="domain_pack_not_found",
            message=f"No custom pack named '{pack_id}' exists.",
        )

    current = existing["manifest"]
    profile_qs = payload.profile_questions
    if profile_qs is None:
        profile_qs = [QuestionInput(**q) for q in current["profile_interview"]["questions"]]
    applied_qs = payload.applied_questions
    if applied_qs is None:
        applied_qs = [QuestionInput(**q) for q in current["applied_interview"]["questions"]]
    dimensions = payload.rubric_dimensions
    if dimensions is None:
        dimensions = [
            RubricDimensionInput(**dim) for dim in current["evaluation_rubric"]["dimensions"]
        ]

    manifest = _build_manifest(
        pack_id=pack_id,
        pack_version=payload.pack_version
        or _bump_patch_version(str(current.get("pack_version", "1.0.0"))),
        display_name=payload.display_name or current["display_name"],
        domain=payload.domain if payload.domain is not None else current.get("domain", ""),
        skills=payload.skills
        if payload.skills is not None
        else current.get("ontology", {}).get("skills", []),
        certifications=payload.certifications
        if payload.certifications is not None
        else current.get("ontology", {}).get("certifications", []),
        concepts=payload.concepts
        if payload.concepts is not None
        else current.get("ontology", {}).get("concepts", []),
        profile_questions=profile_qs,
        applied_questions=applied_qs,
        rubric_dimensions=dimensions,
        profile_task_style=payload.profile_task_style
        or current["profile_interview"].get("task_style", "scenario"),
        applied_task_style=payload.applied_task_style
        or current["applied_interview"].get("task_style", "scenario"),
        matching_weights=payload.matching_weights or current.get("matching_weights"),
    )
    try:
        validate_manifest(manifest)
    except PackValidationError:
        raise

    updated = store.update_tenant_pack(
        conn, tenant_id=context.tenant_id, pack_id=pack_id, manifest=manifest
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="domain_pack.updated",
        resource_type="domain_pack",
        resource_id=pack_id,
        old_state={"pack_version": current.get("pack_version")},
        new_state={"pack_version": manifest["pack_version"]},
    )
    conn.commit()
    linked = store.count_postings_for_pack(conn, tenant_id=context.tenant_id, pack_id=pack_id)
    assert updated is not None
    return {"pack": _pack_summary(updated["manifest"], source="custom", linked_jobs=linked)}


@router.delete("/domain-packs/{pack_id}", status_code=200)
async def delete_domain_pack(
    pack_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    registry: PackRegistryDependency,
) -> dict[str, Any]:
    require_role(context, ADMIN_ROLES)
    if any(pack["pack_id"] == pack_id for pack in registry.available_packs()):
        raise ApiError(
            status_code=409,
            code="pack_immutable",
            message="Built-in domain packs cannot be deleted.",
        )
    existing = store.get_tenant_pack(conn, tenant_id=context.tenant_id, pack_id=pack_id)
    if existing is None:
        raise ApiError(
            status_code=404,
            code="domain_pack_not_found",
            message=f"No custom pack named '{pack_id}' exists.",
        )

    linked = store.count_postings_for_pack(conn, tenant_id=context.tenant_id, pack_id=pack_id)
    if linked > 0:
        raise ApiError(
            status_code=409,
            code="pack_in_use",
            message=(
                f"Cannot delete '{pack_id}' because {linked} job"
                f"{'s are' if linked != 1 else ' is'} linked to it."
            ),
        )

    store.delete_tenant_pack(conn, tenant_id=context.tenant_id, pack_id=pack_id)
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="domain_pack.deleted",
        resource_type="domain_pack",
        resource_id=pack_id,
        old_state={"pack_version": existing["pack_version"]},
    )
    conn.commit()
    return {"deleted": True, "pack_id": pack_id}


class ActivatePackRequest(BaseModel):
    pack_id: str = Field(min_length=1, max_length=100)


@router.post("/organizations/current/domain-packs/activations", status_code=201)
async def activate_domain_pack(
    payload: ActivatePackRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    registry: PackRegistryDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, ADMIN_ROLES)
    manifest, source = resolve_pack_manifest(
        conn, tenant_id=context.tenant_id, pack_id=payload.pack_id, registry=registry
    )
    previous = store.get_active_pack(conn, tenant_id=context.tenant_id)
    activation = store.activate_pack(
        conn, tenant_id=context.tenant_id, manifest=manifest, actor_user_id=context.user["id"]
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="domain_pack.activated",
        resource_type="domain_pack",
        resource_id=manifest["pack_id"],
        old_state=(
            {"pack_id": previous["pack_id"], "pack_version": previous["pack_version"]}
            if previous
            else None
        ),
        new_state={
            "pack_id": manifest["pack_id"],
            "pack_version": manifest["pack_version"],
            "source": source,
        },
    )
    store.emit_event(
        conn,
        event_name="DOMAIN_PACK_ACTIVATED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="domain_pack",
        resource_id=manifest["pack_id"],
        payload={"pack_version": manifest["pack_version"], "source": source},
    )
    conn.commit()
    return {
        "activation": {
            "pack_id": activation["pack_id"],
            "pack_version": activation["pack_version"],
            "activated_at": activation["activated_at"],
        }
    }


@router.get("/organizations/current/domain-packs/active")
async def get_active_pack(
    conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    activation = store.get_active_pack(conn, tenant_id=context.tenant_id)
    if activation is None:
        return {"activation": None}
    return {
        "activation": {
            "pack_id": activation["pack_id"],
            "pack_version": activation["pack_version"],
            "activated_at": activation["activated_at"],
            "display_name": activation["manifest"]["display_name"],
        }
    }
