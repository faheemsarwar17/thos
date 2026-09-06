from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import (
    ADMIN_ROLES,
    DbDependency,
    EmployerContextDependency,
    require_role,
)
from app.core.errors import ApiError
from app.db import store
from app.domain import stages as stage_domain

router = APIRouter(tags=["workflows"])


class UpdateCompanyWorkflowRequest(BaseModel):
    """Companies assemble a workflow from catalog components only."""

    components: list[str] = Field(default_factory=list)


def _stages_and_mapping_from_components(
    component_ids: list[str],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    try:
        stage_dicts = stage_domain.build_stages_from_components(component_ids)
        mapping = {
            stage["id"]: stage_domain.CANDIDATE_STATUS_BY_CATEGORY.get(
                stage["category"], "Decision"
            )
            for stage in stage_dicts
        }
        stage_domain.validate_stages(stage_dicts)
        stage_domain.validate_candidate_status_mapping(stage_dicts, mapping)
    except stage_domain.WorkflowValidationError as exc:
        raise ApiError(status_code=422, code="invalid_workflow", message=str(exc)) from exc
    return stage_dicts, mapping


def _workflow_response(workflow: dict[str, Any] | None) -> dict[str, Any] | None:
    if workflow is None:
        return None
    return {
        **workflow,
        "components": stage_domain.components_from_stages(workflow["stages"]),
        "fixed_stages": [
            {
                "id": stage.id,
                "label": stage.label,
                "category": stage.category,
            }
            for stage in stage_domain.FIXED_STAGES
        ],
    }


@router.get("/workflows/components")
async def list_workflow_components(context: EmployerContextDependency) -> dict[str, Any]:
    return {
        "components": stage_domain.component_catalog(),
        "fixed_stages": [
            {
                "id": stage.id,
                "label": stage.label,
                "category": stage.category,
                "required": True,
            }
            for stage in stage_domain.FIXED_STAGES
        ],
    }


@router.get("/workflows")
async def list_workflows(conn: DbDependency, context: EmployerContextDependency) -> dict[str, Any]:
    workflow = store.get_company_workflow(conn, tenant_id=context.tenant_id)
    return {"workflows": [_workflow_response(workflow)] if workflow else []}


@router.get("/workflows/current")
@router.get("/workflows/active")
async def get_current_workflow(
    conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    workflow = store.get_company_workflow(conn, tenant_id=context.tenant_id)
    return {"workflow": _workflow_response(workflow)}


@router.put("/workflows/current")
async def upsert_company_workflow(
    payload: UpdateCompanyWorkflowRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    """Create or replace the company's single hiring workflow from components."""
    require_role(context, ADMIN_ROLES)
    stage_dicts, mapping = _stages_and_mapping_from_components(payload.components)
    previous = store.get_company_workflow(conn, tenant_id=context.tenant_id)
    workflow = store.update_company_workflow(
        conn,
        tenant_id=context.tenant_id,
        stages=stage_dicts,
        mapping=mapping,
        actor_user_id=context.user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="workflow.updated" if previous else "workflow.created",
        resource_type="workflow_version",
        resource_id=workflow["id"],
        old_state={"version": previous["version"]} if previous else None,
        new_state={
            "version": workflow["version"],
            "components": payload.components,
        },
    )
    conn.commit()
    return {"workflow": _workflow_response(workflow)}


@router.post("/workflows", status_code=201)
async def create_workflow(
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    """Ensure the company has a workflow (defaults if none exists)."""
    require_role(context, ADMIN_ROLES)
    existing = store.get_company_workflow(conn, tenant_id=context.tenant_id)
    if existing is not None:
        raise ApiError(
            status_code=409,
            code="workflow_already_exists",
            message="This organization already has a hiring workflow. Edit it instead.",
        )
    workflow = store.get_or_create_company_workflow(
        conn, tenant_id=context.tenant_id, actor_user_id=context.user["id"]
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="workflow.created",
        resource_type="workflow_version",
        resource_id=workflow["id"],
        new_state={
            "version": workflow["version"],
            "components": stage_domain.DEFAULT_COMPONENT_IDS,
        },
    )
    conn.commit()
    return {"workflow": _workflow_response(workflow)}
