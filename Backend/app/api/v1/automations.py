from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import (
    CorrelationIdDependency,
    DbDependency,
    EmployerContextDependency,
    require_role,
    ADMIN_ROLES,
    PIPELINE_ROLES,
)
from app.core.errors import ApiError
from app.db import store

router = APIRouter(prefix="/automations", tags=["automations"])


class ConditionModel(BaseModel):
    field: str
    op: str = "eq"  # 'eq' | 'neq' | 'gte' | 'lte' | 'contains'
    value: Any


class ActionModel(BaseModel):
    type: str  # 'send_email' | 'send_notification' | 'tag_candidate' | 'assign_task'
    config: dict[str, Any] = Field(default_factory=dict)


class CreateAutomationRuleRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(default="")
    trigger_event: str  # 'stage_entered' | 'score_threshold' | 'sla_exceeded'
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    conditions: list[ConditionModel] = Field(default_factory=list)
    actions: list[ActionModel] = Field(default_factory=list)


class UpdateAutomationRuleRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_event: str | None = None
    trigger_config: dict[str, Any] | None = None
    conditions: list[ConditionModel] | None = None
    actions: list[ActionModel] | None = None
    is_active: int | None = None


@router.get("")
async def list_automations(
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    rules = store.list_automation_rules(conn, tenant_id=context.tenant_id)
    runs = store.list_automation_runs(conn, tenant_id=context.tenant_id, limit=20)
    return {
        "rules": rules,
        "runs": runs,
    }


@router.post("")
async def create_automation(
    payload: CreateAutomationRuleRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    rule = store.create_automation_rule(
        conn,
        tenant_id=context.tenant_id,
        name=payload.name,
        description=payload.description,
        trigger_event=payload.trigger_event,
        trigger_config=payload.trigger_config,
        conditions=[c.model_dump() for c in payload.conditions],
        actions=[a.model_dump() for a in payload.actions],
        created_by=context.user["id"],
    )

    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="automation.created",
        resource_type="automation_rule",
        resource_id=rule["id"],
        new_state=rule,
    )
    conn.commit()
    return {"rule": rule}


@router.get("/{rule_id}")
async def get_automation(
    rule_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    rule = store.get_automation_rule(conn, tenant_id=context.tenant_id, rule_id=rule_id)
    if not rule:
        raise ApiError(status_code=404, code="not_found", message="Automation rule not found.")
    return {"rule": rule}


@router.put("/{rule_id}")
async def update_automation(
    rule_id: str,
    payload: UpdateAutomationRuleRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    rule = store.get_automation_rule(conn, tenant_id=context.tenant_id, rule_id=rule_id)
    if not rule:
        raise ApiError(status_code=404, code="not_found", message="Automation rule not found.")

    fields: dict[str, Any] = {}
    if payload.name is not None:
        fields["name"] = payload.name
    if payload.description is not None:
        fields["description"] = payload.description
    if payload.trigger_event is not None:
        fields["trigger_event"] = payload.trigger_event
    if payload.trigger_config is not None:
        fields["trigger_config"] = payload.trigger_config
    if payload.conditions is not None:
        fields["conditions"] = [c.model_dump() for c in payload.conditions]
    if payload.actions is not None:
        fields["actions"] = [a.model_dump() for a in payload.actions]
    if payload.is_active is not None:
        fields["is_active"] = payload.is_active

    updated = store.update_automation_rule(
        conn, tenant_id=context.tenant_id, rule_id=rule_id, fields=fields
    )
    conn.commit()
    return {"rule": updated}


@router.post("/{rule_id}/toggle")
async def toggle_automation(
    rule_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    rule = store.get_automation_rule(conn, tenant_id=context.tenant_id, rule_id=rule_id)
    if not rule:
        raise ApiError(status_code=404, code="not_found", message="Automation rule not found.")

    new_active = 0 if rule["is_active"] == 1 else 1
    updated = store.update_automation_rule(
        conn, tenant_id=context.tenant_id, rule_id=rule_id, fields={"is_active": new_active}
    )
    conn.commit()
    return {"rule": updated}


@router.delete("/{rule_id}")
async def delete_automation(
    rule_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    deleted = store.delete_automation_rule(conn, tenant_id=context.tenant_id, rule_id=rule_id)
    if not deleted:
        raise ApiError(status_code=404, code="not_found", message="Automation rule not found.")
    conn.commit()
    return {"deleted": True}


@router.post("/{rule_id}/test")
async def test_automation_dry_run(
    rule_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    """Dry-run test of an automation rule against sample candidate context."""
    require_role(context, PIPELINE_ROLES)
    rule = store.get_automation_rule(conn, tenant_id=context.tenant_id, rule_id=rule_id)
    if not rule:
        raise ApiError(status_code=404, code="not_found", message="Automation rule not found.")

    # Find sample application in this tenant
    app_row = conn.execute(
        """SELECT a.*, p.title as posting_title, u.display_name as candidate_name, u.email as candidate_email
           FROM applications a
           JOIN postings p ON p.id = a.posting_id
           JOIN candidates c ON c.id = a.candidate_id
           JOIN users u ON u.id = c.user_id
           WHERE a.tenant_id=? LIMIT 1""",
        (context.tenant_id,),
    ).fetchone()

    sample_ctx = dict(app_row) if app_row else {
        "candidate_name": "Sample Candidate",
        "candidate_email": "candidate@example.com",
        "posting_title": "Senior Engineer",
        "stage_id": "shortlisted",
        "job_match_score": 88.0,
    }

    # Evaluate conditions
    eval_results = []
    all_matched = True
    for cond in rule["conditions"]:
        field = cond.get("field")
        op = cond.get("op", "eq")
        expected = cond.get("value")
        actual = sample_ctx.get(field)

        matched = False
        if op == "eq":
            matched = str(actual).lower() == str(expected).lower()
        elif op == "gte":
            matched = float(actual or 0) >= float(expected or 0)
        elif op == "lte":
            matched = float(actual or 0) <= float(expected or 0)
        elif op == "contains":
            matched = str(expected).lower() in str(actual).lower()

        eval_results.append({
            "field": field,
            "op": op,
            "expected": expected,
            "actual": actual,
            "matched": matched,
        })
        if not matched:
            all_matched = False

    simulated_actions = []
    if all_matched:
        for a in rule["actions"]:
            simulated_actions.append({
                "type": a.get("type"),
                "status": "simulated_success",
                "output": f"Would dispatch action {a.get('type')} to {sample_ctx.get('candidate_name')}",
            })

    # Record a test run in the log
    store.record_automation_run(
        conn,
        tenant_id=context.tenant_id,
        rule_id=rule_id,
        trigger_resource_id=sample_ctx.get("id", "simulated-test"),
        status="completed" if all_matched else "skipped",
        execution_log=f"Dry run simulation completed with status: {'Matched' if all_matched else 'Skipped'}",
    )
    conn.commit()

    return {
        "matched": all_matched,
        "sample_candidate": sample_ctx.get("candidate_name"),
        "condition_evaluations": eval_results,
        "simulated_actions": simulated_actions,
    }
