"""Employer pipeline: query, single transition command, review tooling.

Every stage change goes through the one transition command (rules.md
§1.4) with optimistic concurrency, requirement checks, an audit record,
and an outbox event in the same transaction.
"""

from typing import Any

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.api.dependencies import (
    EMPLOYER_ROLES,
    PIPELINE_ROLES,
    CorrelationIdDependency,
    DbDependency,
    EmployerContextDependency,
    SettingsDependency,
    require_role,
)
from app.core.errors import ApiError
from app.core.ids import new_id
from app.db import store
from app.db.database import utc_now
from app.domain.stages import (
    CATEGORY_ASSESSMENT,
    CATEGORY_REVIEW,
    FIXED_STAGES,
    HUMAN_APPROVAL_CATEGORIES,
    TERMINAL_CATEGORIES,
    WorkflowDefinition,
)
from app.logging import logger
from app.services import mail_templates
from app.services.ai_feedback import (
    generate_candidate_improvement_feedback,
    send_rejection_feedback_email,
)
from app.services.avatars import resolve_avatar
from app.services.mail import send_interview_link
from app.services.matching import evaluate_jd_match, score_candidate_for_posting

router = APIRouter(tags=["pipeline"])

TRANSITION_EVENT_BY_CATEGORY = {
    "rejected": "APPLICATION_REJECTED",
    "withdrawn": "APPLICATION_WITHDRAWN",
    "hired": "CANDIDATE_HIRED",
    "offer": "OFFER_CREATED",
}

# Stage changes in these categories use the acceptance/rejection templates;
# every other destination uses the generic stage_update template.
EMAIL_TEMPLATE_BY_CATEGORY = {
    "hired": mail_templates.TEMPLATE_ACCEPTANCE,
    "rejected": mail_templates.TEMPLATE_REJECTION,
}


def _workflow_for(posting: dict[str, Any]) -> WorkflowDefinition:
    snapshot = posting.get("workflow_snapshot") or {}
    stages = snapshot.get("stages")
    if not stages:
        raise ApiError(
            status_code=409,
            code="posting_misconfigured",
            message="This posting has no workflow snapshot.",
        )
    return WorkflowDefinition(stages=stages)


def _application_card(
    conn, application: dict[str, Any], posting: dict[str, Any], workflow: WorkflowDefinition
) -> dict[str, Any]:
    candidate = store.get_candidate(conn, application["candidate_id"])
    user = store.get_user(conn, candidate["user_id"]) if candidate else None
    attempt = store.get_applied_attempt_by_application(conn, application_id=application["id"])
    stage = workflow.stage_by_id(application["stage_id"]) or {
        "id": application["stage_id"],
        "label": application["stage_id"],
        "category": application["stage_category"],
    }
    order = workflow.pipeline_order()
    stage_index = next((i for i, s in enumerate(order) if s["id"] == stage["id"]), None)
    sandbox_session = (attempt or {}).get("sandbox_session")
    if isinstance(sandbox_session, dict):
        sandbox_status = sandbox_session.get("status")
        sandbox_score = (sandbox_session.get("evaluation") or {}).get("score")
    else:
        sandbox_status = None
        sandbox_score = None
    return {
        "id": application["id"],
        "candidate_name": user["display_name"] if user else "Unknown candidate",
        "candidate_has_avatar": bool((user or {}).get("avatar_path")),
        "candidate_avatar_url": (
            f"/api/v1/applications/{application['id']}/candidate-avatar"
            if (user or {}).get("avatar_path")
            else None
        ),
        "posting_id": posting["id"],
        "job_title": posting["title"],
        "stage_id": stage["id"],
        "stage_label": stage["label"],
        "stage_category": stage["category"],
        "stage_position": (
            {"current": stage_index + 1, "total": len(order)} if stage_index is not None else None
        ),
        "stage_version": application["stage_version"],
        "profile_interview_score": application["profile_interview_score"],
        "job_match_score": application.get("job_match_score"),
        "job_match_reasons": application.get("job_match_reasons"),
        "ai_improvement_feedback": application.get("ai_improvement_feedback"),
        "applied_interview_status": attempt["status"] if attempt else None,
        "identity_verification": (attempt or {}).get("identity_verification"),
        "sandbox_status": sandbox_status,
        "sandbox_score": sandbox_score,
        "applied_at": application["created_at"],
        "updated_at": application["updated_at"],
        "valid_destinations": [
            {"id": s["id"], "label": s["label"], "requires_reason": s.get("requires_reason", False)}
            for s in workflow.valid_destinations(stage["id"])
        ],
    }


async def _send_stage_progression_email(
    conn,
    *,
    tenant_id: str,
    application: dict[str, Any],
    posting: dict[str, Any],
    destination: dict[str, Any],
    settings,
    note: str = "",
) -> None:
    """Email the candidate about a stage change using the tenant's templates.

    Called after the transition commits; mail must never break the request.
    """
    candidate = store.get_candidate(conn, application["candidate_id"])
    user = store.get_user(conn, candidate["user_id"]) if candidate else None
    if not user or not user.get("email"):
        return
    org = store.get_organization(conn, tenant_id)
    mapping = (posting.get("workflow_snapshot") or {}).get("candidate_status_mapping") or {}
    template_key = EMAIL_TEMPLATE_BY_CATEGORY.get(
        destination["category"], mail_templates.TEMPLATE_STAGE_UPDATE
    )
    await mail_templates.send_templated_email(
        conn,
        tenant_id=tenant_id,
        template_key=template_key,
        to_email=user["email"],
        context={
            "candidate_name": user.get("display_name") or user["email"],
            "job_title": posting["title"],
            "organization_name": (org or {}).get("name", "the company"),
            "stage_label": destination["label"],
            "status": mapping.get(destination["id"], destination["label"]),
            "decision": destination["category"],
            "message": note,
            "applications_url": f"{settings.public_base_url}/candidate/applications",
        },
        settings=settings,
    )


@router.get("/pipeline")
async def get_pipeline(
    conn: DbDependency,
    context: EmployerContextDependency,
    posting_id: str | None = None,
) -> dict[str, Any]:
    require_role(context, EMPLOYER_ROLES)
    postings = store.list_postings(conn, tenant_id=context.tenant_id)
    if posting_id:
        postings = [p for p in postings if p["id"] == posting_id]
        if not postings:
            raise ApiError(status_code=404, code="not_found", message="Posting not found.")

    columns: list[dict[str, Any]] = []
    cards_by_stage: dict[str, list[dict[str, Any]]] = {}
    workflow: WorkflowDefinition | None = None
    for posting in postings:
        if not posting.get("workflow_snapshot"):
            continue
        posting_workflow = _workflow_for(posting)
        if workflow is None:
            workflow = posting_workflow
        applications = store.list_applications_for_tenant(
            conn, tenant_id=context.tenant_id, posting_id=posting["id"]
        )
        for application in applications:
            card = _application_card(conn, application, posting, posting_workflow)
            cards_by_stage.setdefault(application["stage_id"], []).append(card)

    if workflow is not None:
        for stage in workflow.stages:
            if stage["category"] in TERMINAL_CATEGORIES and stage["category"] not in (
                "hired",
                "rejected",
            ):
                continue
            columns.append(
                {
                    "stage_id": stage["id"],
                    "label": stage["label"],
                    "category": stage["category"],
                    "cards": sorted(
                        cards_by_stage.get(stage["id"], []), key=lambda c: c["updated_at"]
                    ),
                }
            )
    return {"columns": columns}


@router.get("/applications/{application_id}")
async def get_application(
    application_id: str, conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    require_role(context, EMPLOYER_ROLES)
    application = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    posting = store.get_posting(
        conn, tenant_id=context.tenant_id, posting_id=application["posting_id"]
    )
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    workflow = _workflow_for(posting)
    card = _application_card(conn, application, posting, workflow)

    attempt = store.get_applied_attempt_by_application(conn, application_id=application_id)
    transitions = store.list_transitions(conn, application_id=application_id)
    actors = {
        t["actor_user_id"]: (store.get_user(conn, t["actor_user_id"]) or {}).get(
            "display_name", "Unknown"
        )
        for t in transitions
    }
    stage_labels = {s["id"]: s["label"] for s in workflow.stages}
    return {
        "application": {
            **card,
            "profile_snapshot": application["profile_snapshot"],
            "answers": application["answers"],
            "applied_interview": (
                {
                    "attempt_id": attempt["id"],
                    "status": attempt["status"],
                    "questions": attempt["questions"],
                    "responses": attempt["responses"],
                    "evaluation": attempt.get("evaluation"),
                    "identity_verification": attempt.get("identity_verification"),
                    "invited_at": attempt["invited_at"],
                    "submitted_at": attempt["submitted_at"],
                }
                if attempt
                else None
            ),
            "scorecards": store.list_scorecards(
                conn, tenant_id=context.tenant_id, application_id=application_id
            ),
            "transitions": [
                {
                    "id": t["id"],
                    "from_stage": stage_labels.get(t["from_stage_id"], t["from_stage_id"]),
                    "to_stage": stage_labels.get(t["to_stage_id"], t["to_stage_id"]),
                    "reason_code": t["reason_code"],
                    "note": t["note"],
                    "actor_name": actors.get(t["actor_user_id"], "Unknown"),
                    "occurred_at": t["occurred_at"],
                }
                for t in transitions
            ],
        }
    }


class TransitionRequest(BaseModel):
    to_stage_id: str = Field(min_length=1, max_length=64)
    from_stage_version: int = Field(ge=1)
    reason_code: str = Field(default="", max_length=100)
    note: str = Field(default="", max_length=4000)
    idempotency_key: str = Field(min_length=1, max_length=128)


@router.post("/applications/{application_id}/transitions")
async def transition_application(
    application_id: str,
    payload: TransitionRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    application = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")

    cached = store.find_idempotent_response(
        conn, key=payload.idempotency_key, tenant_id=context.tenant_id, operation="transition"
    )
    if cached:
        return cached

    posting = store.get_posting(
        conn, tenant_id=context.tenant_id, posting_id=application["posting_id"]
    )
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    workflow = _workflow_for(posting)

    if application["stage_version"] != payload.from_stage_version:
        current_card = _application_card(conn, application, posting, workflow)
        raise ApiError(
            status_code=409,
            code="application_stage_conflict",
            message=(
                f"This application is now in {current_card['stage_label']}. "
                "Refresh it before moving the candidate."
            ),
        )

    destination = workflow.stage_by_id(payload.to_stage_id)
    valid_ids = {s["id"] for s in workflow.valid_destinations(application["stage_id"])}
    if destination is None or payload.to_stage_id not in valid_ids:
        raise ApiError(
            status_code=422,
            code="invalid_transition",
            message="That stage is not a valid destination from the current stage.",
        )
    if destination["category"] in HUMAN_APPROVAL_CATEGORIES and not payload.reason_code:
        raise ApiError(
            status_code=422,
            code="reason_required",
            message=(
                f"Moving a candidate to {destination['label']} requires a reason. "
                "Add a reason code and try again."
            ),
        )

    moved = store.update_application_stage(
        conn,
        tenant_id=context.tenant_id,
        application_id=application_id,
        stage_id=destination["id"],
        stage_category=destination["category"],
        expected_version=payload.from_stage_version,
    )
    if not moved:
        raise ApiError(
            status_code=409,
            code="application_stage_conflict",
            message="The application changed while you were working. Refresh and retry.",
        )
    transition = store.record_transition(
        conn,
        tenant_id=context.tenant_id,
        application_id=application_id,
        from_stage_id=application["stage_id"],
        to_stage_id=destination["id"],
        reason_code=payload.reason_code or "not_required",
        note=payload.note,
        actor_user_id=context.user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="application.transitioned",
        resource_type="application",
        resource_id=application_id,
        old_state={"stage_id": application["stage_id"]},
        new_state={"stage_id": destination["id"]},
        reason=payload.reason_code,
    )
    store.emit_event(
        conn,
        event_name="APPLICATION_STAGE_CHANGED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="application",
        resource_id=application_id,
        payload={"from_stage_id": application["stage_id"], "to_stage_id": destination["id"]},
    )
    extra_event = TRANSITION_EVENT_BY_CATEGORY.get(destination["category"])
    if extra_event:
        store.emit_event(
            conn,
            event_name=extra_event,
            tenant_id=context.tenant_id,
            actor_user_id=context.user["id"],
            correlation_id=correlation_id,
            resource_type="application",
            resource_id=application_id,
        )

    # Automatic AI Match & Interview Link when entering review stage
    if destination["category"] == CATEGORY_REVIEW:
        try:
            candidate = store.get_candidate(conn, application["candidate_id"])
            if candidate and candidate.get("embedding"):
                # Fetch domain manifest
                org = store.get_organization(conn, context.tenant_id)
                manifest = {} # Fallback
                if org and "domain_packs" in org and posting.get("domain_pack_id"):
                    for pack in org["domain_packs"]:
                        if pack["id"] == posting["domain_pack_id"]:
                            manifest = pack
                            break
                            
                score_data = score_candidate_for_posting(
                    candidate=candidate,
                    posting=posting,
                    manifest=manifest,
                    interview_score=None,
                    posting_embedding=posting.get("embedding"),
                    candidate_embedding=candidate.get("embedding")
                )
                
                # Fetch transcripts from the best profile attempt
                best_attempt = None
                if manifest:
                    from app.db import store as db_store
                    attempts = db_store.list_profile_attempts(conn, candidate_id=candidate["id"])
                    pack_attempts = [
                        a
                        for a in attempts
                        if a["pack_id"] == manifest.get("pack_id")
                        and a["status"] in ("completed", "analyzed", "evaluated")
                    ]
                    if pack_attempts:
                        best_attempt = max(
                            pack_attempts,
                            key=lambda a: (a.get("evaluation") or {}).get("score", 0),
                        )

                transcripts = best_attempt.get("transcripts", []) if best_attempt else []
                
                # If score meets threshold (e.g. 75), auto-send interview
                if score_data and score_data.get("score", 0) >= 75.0:
                    user = store.get_user(conn, candidate["user_id"])
                    if user:
                        interview_url = f"{settings.public_base_url}/candidate/applications"
                        # In production this would be backgrounded.
                        import asyncio
                        asyncio.create_task(
                            send_interview_link(
                                to_email=user["email"],
                                candidate_name=user["display_name"],
                                job_title=posting["title"],
                                organization_name=org["name"] if org else "the company",
                                interview_url=interview_url
                            )
                        )

                # Background the LLM JD match evaluation
                import asyncio

                from app.services.matching import evaluate_jd_match
                
                async def update_application_job_match(app_id, cand, post, ts):
                    match_eval = await evaluate_jd_match(cand, post, ts)
                    if match_eval:
                        # Re-open a brief connection to save the score
                        import psycopg

                        from app.core.config import get_settings
                        settings = get_settings()
                        with psycopg.connect(settings.database_url.get_secret_value()) as bg_conn:
                            bg_conn.execute(
                                "UPDATE applications SET job_match_score = %s,"
                                " job_match_reasons = %s, updated_at = %s WHERE id = %s",
                                (match_eval.score, match_eval.reasoning, utc_now(), app_id)
                            )
                            bg_conn.commit()
                            
                asyncio.create_task(
                    update_application_job_match(application_id, candidate, posting, transcripts)
                )
        except Exception as e:
            import logging
            logging.error(f"Failed pipeline automated actions: {e}")

    # Candidate-facing notification uses the mapped status only.
    candidate = store.get_candidate(conn, application["candidate_id"])
    if candidate:
        mapping = (posting.get("workflow_snapshot") or {}).get("candidate_status_mapping") or {}
        status = mapping.get(destination["id"], "Under review")
        store.create_notification(
            conn,
            tenant_id=context.tenant_id,
            recipient_user_id=candidate["user_id"],
            title=f"Update on your application for {posting['title']}",
            body=f"Your application status is now: {status}.",
            link="/candidate/applications",
        )

    updated = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    body = {
        "application": _application_card(conn, updated, posting, workflow),  # type: ignore[arg-type]
        "transition": {
            "id": transition["id"],
            "from_stage_id": transition["from_stage_id"],
            "to_stage_id": transition["to_stage_id"],
            "occurred_at": transition["occurred_at"],
        },
    }
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.tenant_id,
        operation="transition",
        body=body,
    )
    conn.commit()
    try:
        await _send_stage_progression_email(
            conn,
            tenant_id=context.tenant_id,
            application=updated,
            posting=posting,
            destination=destination,
            settings=settings,
            note=payload.note,
        )
    except Exception as exc:  # mail must never break a committed transition
        logger.error(f"Stage progression email failed: {exc}")
    return body


class BulkTransitionRequest(BaseModel):
    application_ids: list[str] = Field(min_length=1, max_length=100)
    to_stage_id: str = Field(min_length=1, max_length=50)
    reason_code: str = Field(default="bulk_action", max_length=50)
    note: str = Field(default="", max_length=2000)


@router.post("/pipeline/bulk-transition")
async def bulk_transition(
    payload: BulkTransitionRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    workflow = store.get_company_workflow(conn, tenant_id=context.tenant_id)
    destination = None
    for stage in (workflow.get("stages") if workflow else []):
        if stage["id"] == payload.to_stage_id:
            destination = stage
            break
    if not destination:
        for fixed in FIXED_STAGES:
            if fixed.id == payload.to_stage_id:
                destination = {"id": fixed.id, "label": fixed.label, "category": fixed.category}
                break
    if not destination:
        raise ApiError(
            status_code=404,
            code="destination_not_found",
            message=f"Stage '{payload.to_stage_id}' not found.",
        )

    successful: list[str] = []
    failed: list[dict[str, str]] = []

    for app_id in payload.application_ids:
        app = store.get_application(conn, tenant_id=context.tenant_id, application_id=app_id)
        if not app:
            failed.append({"id": app_id, "reason": "Application not found"})
            continue
        if app["stage_category"] in TERMINAL_CATEGORIES:
            failed.append({"id": app_id, "reason": f"Already terminal ({app['stage_category']})"})
            continue
        if app["stage_id"] == destination["id"]:
            failed.append({"id": app_id, "reason": "Already in target stage"})
            continue

        moved = store.update_application_stage(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            stage_id=destination["id"],
            stage_category=destination["category"],
            expected_version=app["stage_version"],
        )
        if not moved:
            failed.append({"id": app_id, "reason": "Conflict: application changed concurrently"})
            continue

        store.record_transition(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            from_stage_id=app["stage_id"],
            to_stage_id=destination["id"],
            reason_code=payload.reason_code,
            note=payload.note,
            actor_user_id=context.user["id"],
        )
        store.write_audit(
            conn,
            tenant_id=context.tenant_id,
            actor_user_id=context.user["id"],
            action="application.bulk_transitioned",
            resource_type="application",
            resource_id=app_id,
            old_state={"stage_id": app["stage_id"]},
            new_state={"stage_id": destination["id"]},
            reason=payload.reason_code,
        )
        store.emit_event(
            conn,
            event_name="APPLICATION_STAGE_CHANGED",
            tenant_id=context.tenant_id,
            actor_user_id=context.user["id"],
            correlation_id=correlation_id,
            resource_type="application",
            resource_id=app_id,
            payload={"from_stage_id": app["stage_id"], "to_stage_id": destination["id"]},
        )
        successful.append(app_id)

    conn.commit()
    return {
        "total": len(payload.application_ids),
        "successful_count": len(successful),
        "successful_ids": successful,
        "failed_count": len(failed),
        "failed": failed,
    }


@router.post("/pipeline/applications/{application_id}/undo-transition")
async def undo_transition(
    application_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    app = store.get_application(conn, tenant_id=context.tenant_id, application_id=application_id)
    if not app:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")

    row = conn.execute(
        """SELECT * FROM application_transitions
           WHERE tenant_id=? AND application_id=?
           ORDER BY occurred_at DESC LIMIT 1""",
        (context.tenant_id, application_id),
    ).fetchone()
    if not row:
        raise ApiError(
            status_code=400,
            code="no_transition_to_undo",
            message="No recent transition found to undo.",
        )

    last_transition = dict(row)
    revert_to_stage_id = last_transition["from_stage_id"]

    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])
    if not posting:
        raise ApiError(status_code=404, code="posting_not_found", message="Posting not found.")

    workflow = _workflow_for(posting)
    revert_stage = workflow.stage_by_id(revert_to_stage_id)
    revert_category = (revert_stage or {}).get("category", "review")

    conn.execute(
        """UPDATE applications
           SET stage_id=?, stage_category=?, stage_version=stage_version+1, updated_at=?
           WHERE tenant_id=? AND id=?""",
        (revert_to_stage_id, revert_category, utc_now(), context.tenant_id, application_id),
    )

    store.record_transition(
        conn,
        tenant_id=context.tenant_id,
        application_id=application_id,
        from_stage_id=app["stage_id"],
        to_stage_id=revert_to_stage_id,
        reason_code="undo_action",
        note="Reverted previous stage transition",
        actor_user_id=context.user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="application.transition_undone",
        resource_type="application",
        resource_id=application_id,
        old_state={"stage_id": app["stage_id"]},
        new_state={"stage_id": revert_to_stage_id},
        reason="undo",
    )
    store.emit_event(
        conn,
        event_name="APPLICATION_STAGE_CHANGED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="application",
        resource_id=application_id,
        payload={
            "from_stage_id": app["stage_id"],
            "to_stage_id": revert_to_stage_id,
            "reverted": True,
        },
    )
    conn.commit()

    updated = store.get_application(conn, tenant_id=context.tenant_id, application_id=application_id)
    return {
        "application": _application_card(conn, updated, posting, workflow),
        "undone": True,
    }


class ScreenReceivedRequest(BaseModel):
    posting_id: str | None = None
    application_ids: list[str] | None = None


@router.post("/pipeline/screen-received")
async def screen_received_applications(
    payload: ScreenReceivedRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    all_apps = store.list_applications_for_tenant(
        conn, tenant_id=context.tenant_id, posting_id=payload.posting_id
    )
    target_ids = set(payload.application_ids) if payload.application_ids else None

    eligible = [
        app
        for app in all_apps
        if app["stage_id"] == "received" and (target_ids is None or app["id"] in target_ids)
    ]

    screened_ids: list[str] = []
    failed: list[dict[str, str]] = []

    for app in eligible:
        app_id = app["id"]
        moved = store.update_application_stage(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            stage_id="screened",
            stage_category=CATEGORY_REVIEW,
            expected_version=app["stage_version"],
        )
        if not moved:
            failed.append({"id": app_id, "reason": "Conflict: application changed concurrently"})
            continue

        store.record_transition(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            from_stage_id="received",
            to_stage_id="screened",
            reason_code="screening_passed",
            note="Application passed initial screening",
            actor_user_id=context.user["id"],
        )
        store.write_audit(
            conn,
            tenant_id=context.tenant_id,
            actor_user_id=context.user["id"],
            action="application.screened",
            resource_type="application",
            resource_id=app_id,
            old_state={"stage_id": "received"},
            new_state={"stage_id": "screened"},
            reason="screening_passed",
        )

        candidate = store.get_candidate(conn, app["candidate_id"])
        posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])
        if candidate and posting and app.get("job_match_score") is None:
            try:
                eval_result = await evaluate_jd_match(candidate, posting, [], settings=settings)
                if eval_result:
                    conn.execute(
                        "UPDATE applications SET job_match_score = ?, job_match_reasons = ?, updated_at = ? WHERE id = ?",
                        (eval_result.score, eval_result.reasoning, utc_now(), app_id),
                    )
            except Exception as e:
                logger.warning(f"Screening JD match calculation failed for {app_id}: {e}")

        if candidate:
            store.create_notification(
                conn,
                tenant_id=context.tenant_id,
                recipient_user_id=candidate["user_id"],
                title=f"Application Screened: {posting['title'] if posting else 'Your Application'}",
                body="Your application has been reviewed and progressed to the Screened stage.",
                link="/candidate/applications",
            )
        screened_ids.append(app_id)

    conn.commit()
    return {
        "screened_count": len(screened_ids),
        "screened_ids": screened_ids,
        "failed_count": len(failed),
        "failed": failed,
    }


class ShortlistRequest(BaseModel):
    posting_id: str | None = None
    application_ids: list[str] | None = None
    top_n: int | None = None
    reject_remaining: bool = False
    send_ai_feedback: bool = True


@router.post("/pipeline/shortlist")
async def shortlist_applications(
    payload: ShortlistRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    all_apps = store.list_applications_for_tenant(
        conn, tenant_id=context.tenant_id, posting_id=payload.posting_id
    )
    screened_apps = [app for app in all_apps if app["stage_id"] == "screened"]

    if payload.application_ids is not None:
        target_set = set(payload.application_ids)
        to_shortlist = [app for app in screened_apps if app["id"] in target_set]
        to_reject = [app for app in screened_apps if app["id"] not in target_set] if payload.reject_remaining else []
    elif payload.top_n is not None and payload.top_n > 0:
        sorted_apps = sorted(
            screened_apps,
            key=lambda a: (a.get("job_match_score") or 0.0, a.get("profile_interview_score") or 0.0),
            reverse=True,
        )
        to_shortlist = sorted_apps[: payload.top_n]
        to_reject = sorted_apps[payload.top_n :] if payload.reject_remaining else []
    else:
        to_shortlist = screened_apps
        to_reject = []

    org = store.get_organization(conn, context.tenant_id)
    org_name = org["name"] if org else "the hiring team"

    shortlisted_ids: list[str] = []
    for app in to_shortlist:
        app_id = app["id"]
        moved = store.update_application_stage(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            stage_id="shortlisted",
            stage_category=CATEGORY_REVIEW,
            expected_version=app["stage_version"],
        )
        if moved:
            store.record_transition(
                conn,
                tenant_id=context.tenant_id,
                application_id=app_id,
                from_stage_id="screened",
                to_stage_id="shortlisted",
                reason_code="shortlisted_for_interview",
                note="Candidate advanced to shortlisted pool",
                actor_user_id=context.user["id"],
            )
            store.write_audit(
                conn,
                tenant_id=context.tenant_id,
                actor_user_id=context.user["id"],
                action="application.shortlisted",
                resource_type="application",
                resource_id=app_id,
                old_state={"stage_id": "screened"},
                new_state={"stage_id": "shortlisted"},
                reason="shortlisted_for_interview",
            )
            cand = store.get_candidate(conn, app["candidate_id"])
            posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])
            if cand:
                store.create_notification(
                    conn,
                    tenant_id=context.tenant_id,
                    recipient_user_id=cand["user_id"],
                    title=f"Application Shortlisted: {posting['title'] if posting else 'Your Application'}",
                    body="Congratulations! Your application has been shortlisted.",
                    link="/candidate/applications",
                )
            shortlisted_ids.append(app_id)

    rejected_ids: list[str] = []
    for app in to_reject:
        app_id = app["id"]
        moved = store.update_application_stage(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            stage_id="rejected",
            stage_category="rejected",
            expected_version=app["stage_version"],
        )
        if moved:
            store.record_transition(
                conn,
                tenant_id=context.tenant_id,
                application_id=app_id,
                from_stage_id="screened",
                to_stage_id="rejected",
                reason_code="not_selected_for_shortlist",
                note="Unselected candidate during shortlist filtering",
                actor_user_id=context.user["id"],
            )
            cand = store.get_candidate(conn, app["candidate_id"])
            user = store.get_user(conn, cand["user_id"]) if cand else None
            posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])

            if cand and posting and user:
                feedback = ""
                if payload.send_ai_feedback:
                    feedback = await generate_candidate_improvement_feedback(
                        candidate=cand,
                        posting=posting,
                        stage_label="Shortlisting",
                        match_reasons=app.get("job_match_reasons"),
                        settings=settings,
                    )
                    store.update_application_feedback(conn, application_id=app_id, feedback=feedback)
                    await send_rejection_feedback_email(
                        to_email=user["email"],
                        candidate_name=user["display_name"],
                        job_title=posting["title"],
                        organization_name=org_name,
                        feedback=feedback,
                        settings=settings,
                    )

                store.create_notification(
                    conn,
                    tenant_id=context.tenant_id,
                    recipient_user_id=cand["user_id"],
                    title=f"Update on your application for {posting['title']}",
                    body="Your application was not selected for shortlisting. Review your personalized feedback.",
                    link="/candidate/applications",
                )
            rejected_ids.append(app_id)

    conn.commit()
    return {
        "shortlisted_count": len(shortlisted_ids),
        "shortlisted_ids": shortlisted_ids,
        "rejected_count": len(rejected_ids),
        "rejected_ids": rejected_ids,
    }


class InviteInterviewsRequest(BaseModel):
    posting_id: str | None = None
    application_ids: list[str] | None = None
    top_n: int | None = None
    reject_remaining: bool = False
    send_ai_feedback: bool = True


@router.post("/pipeline/invite-interviews")
async def invite_interviews(
    payload: InviteInterviewsRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    all_apps = store.list_applications_for_tenant(
        conn, tenant_id=context.tenant_id, posting_id=payload.posting_id
    )
    shortlisted_apps = [app for app in all_apps if app["stage_id"] == "shortlisted"]

    if payload.application_ids is not None:
        target_set = set(payload.application_ids)
        to_invite = [app for app in shortlisted_apps if app["id"] in target_set]
        to_reject = [app for app in shortlisted_apps if app["id"] not in target_set] if payload.reject_remaining else []
    elif payload.top_n is not None and payload.top_n > 0:
        sorted_apps = sorted(
            shortlisted_apps,
            key=lambda a: (a.get("job_match_score") or 0.0, a.get("profile_interview_score") or 0.0),
            reverse=True,
        )
        to_invite = sorted_apps[: payload.top_n]
        to_reject = sorted_apps[payload.top_n :] if payload.reject_remaining else []
    else:
        to_invite = shortlisted_apps
        to_reject = []

    org = store.get_organization(conn, context.tenant_id)
    org_name = org["name"] if org else "the hiring team"

    invited_ids: list[str] = []
    for app in to_invite:
        app_id = app["id"]
        moved = store.update_application_stage(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            stage_id="applied_interview",
            stage_category=CATEGORY_ASSESSMENT,
            expected_version=app["stage_version"],
        )
        if moved:
            store.record_transition(
                conn,
                tenant_id=context.tenant_id,
                application_id=app_id,
                from_stage_id="shortlisted",
                to_stage_id="applied_interview",
                reason_code="invited_to_interview",
                note="Advanced to AI Applied Interview",
                actor_user_id=context.user["id"],
            )
            posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])
            cand = store.get_candidate(conn, app["candidate_id"])
            user = store.get_user(conn, cand["user_id"]) if cand else None

            existing_attempt = store.get_applied_attempt_by_application(conn, application_id=app_id)
            if not existing_attempt and posting:
                pool = posting.get("question_pool") or {"version": 1, "questions": []}
                attempt = {
                    "id": new_id("aia"),
                    "tenant_id": context.tenant_id,
                    "application_id": app_id,
                    "candidate_id": app["candidate_id"],
                    "posting_id": posting["id"],
                    "pool_version": pool.get("version", 1),
                    "status": "invited",
                    "questions": pool.get("questions", []),
                    "responses": {},
                    "evaluation": None,
                    "invited_at": utc_now(),
                    "started_at": None,
                    "submitted_at": None,
                }
                store.create_applied_attempt(conn, attempt)

            if user and posting:
                interview_url = f"{settings.public_base_url}/candidate/applications"
                await send_interview_link(
                    to_email=user["email"],
                    candidate_name=user["display_name"],
                    job_title=posting["title"],
                    organization_name=org_name,
                    interview_url=interview_url,
                    settings=settings,
                )
                store.create_notification(
                    conn,
                    tenant_id=context.tenant_id,
                    recipient_user_id=cand["user_id"],
                    title=f"Interview Invitation: {posting['title']}",
                    body="You are invited to an AI Applied Interview. Access your session anytime.",
                    link="/candidate/applications",
                )
            invited_ids.append(app_id)

    rejected_ids: list[str] = []
    for app in to_reject:
        app_id = app["id"]
        moved = store.update_application_stage(
            conn,
            tenant_id=context.tenant_id,
            application_id=app_id,
            stage_id="rejected",
            stage_category="rejected",
            expected_version=app["stage_version"],
        )
        if moved:
            store.record_transition(
                conn,
                tenant_id=context.tenant_id,
                application_id=app_id,
                from_stage_id="shortlisted",
                to_stage_id="rejected",
                reason_code="not_selected_for_interview",
                note="Unselected candidate during interview invitation stage",
                actor_user_id=context.user["id"],
            )
            cand = store.get_candidate(conn, app["candidate_id"])
            user = store.get_user(conn, cand["user_id"]) if cand else None
            posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])

            if cand and posting and user:
                feedback = ""
                if payload.send_ai_feedback:
                    feedback = await generate_candidate_improvement_feedback(
                        candidate=cand,
                        posting=posting,
                        stage_label="Interview Invitation",
                        match_reasons=app.get("job_match_reasons"),
                        settings=settings,
                    )
                    store.update_application_feedback(conn, application_id=app_id, feedback=feedback)
                    await send_rejection_feedback_email(
                        to_email=user["email"],
                        candidate_name=user["display_name"],
                        job_title=posting["title"],
                        organization_name=org_name,
                        feedback=feedback,
                        settings=settings,
                    )

                store.create_notification(
                    conn,
                    tenant_id=context.tenant_id,
                    recipient_user_id=cand["user_id"],
                    title=f"Update on your application for {posting['title']}",
                    body="Your application was not selected for an interview. Review your personalized feedback.",
                    link="/candidate/applications",
                )
            rejected_ids.append(app_id)

    conn.commit()
    return {
        "invited_count": len(invited_ids),
        "invited_ids": invited_ids,
        "rejected_count": len(rejected_ids),
        "rejected_ids": rejected_ids,
    }


class InviteAppliedInterviewRequest(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=128)


@router.post("/applications/{application_id}/applied-interview-invitations", status_code=201)
async def invite_applied_interview(
    application_id: str,
    payload: InviteAppliedInterviewRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    application = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    cached = store.find_idempotent_response(
        conn, key=payload.idempotency_key, tenant_id=context.tenant_id, operation="invite_ai"
    )
    if cached:
        return cached
    existing = store.get_applied_attempt_by_application(conn, application_id=application_id)
    if existing:
        raise ApiError(
            status_code=409,
            code="already_invited",
            message="This candidate already has an Applied Interview for this job.",
        )
    posting = store.get_posting(
        conn, tenant_id=context.tenant_id, posting_id=application["posting_id"]
    )
    if posting is None or posting["pool_status"] != "locked" or not posting.get("question_pool"):
        raise ApiError(
            status_code=422,
            code="question_pool_not_locked",
            message="Lock the question pool before inviting candidates to interview.",
        )
    pool = posting["question_pool"]
    attempt = {
        "id": new_id("aia"),
        "tenant_id": context.tenant_id,
        "application_id": application_id,
        "candidate_id": application["candidate_id"],
        "posting_id": posting["id"],
        # Every candidate on this posting receives the same locked pool version.
        "pool_version": pool["version"],
        "status": "invited",
        "questions": pool["questions"],
        "responses": {},
        "evaluation": None,
        "invited_at": utc_now(),
        "started_at": None,
        "submitted_at": None,
    }
    stored = store.create_applied_attempt(conn, attempt)
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="applied_interview.invited",
        resource_type="applied_interview_attempt",
        resource_id=attempt["id"],
        new_state={"application_id": application_id, "pool_version": pool["version"]},
    )
    store.emit_event(
        conn,
        event_name="APPLIED_INTERVIEW_INVITED",
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="applied_interview_attempt",
        resource_id=attempt["id"],
    )
    candidate = store.get_candidate(conn, application["candidate_id"])
    if candidate:
        store.create_notification(
            conn,
            tenant_id=context.tenant_id,
            recipient_user_id=candidate["user_id"],
            title=f"Interview invitation: {posting['title']}",
            body=(
                "You are invited to complete an Applied Interview. "
                "Open your applications to begin."
            ),
            link="/candidate/applications",
        )
    body = {"attempt": {"id": stored["id"], "status": stored["status"]}}
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.tenant_id,
        operation="invite_ai",
        body=body,
    )
    conn.commit()
    return body


class ScorecardRequest(BaseModel):
    scores: dict[str, int]
    recommendation: str = Field(pattern=r"^(advance|hold|reject)$")
    note: str = Field(default="", max_length=4000)


@router.post("/applications/{application_id}/scorecards", status_code=201)
async def create_scorecard(
    application_id: str,
    payload: ScorecardRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_role(context, EMPLOYER_ROLES)
    application = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    for dimension, value in payload.scores.items():
        if not 0 <= value <= 100:
            raise ApiError(
                status_code=422,
                code="invalid_score",
                message=f"Score for '{dimension}' must be between 0 and 100.",
            )
    existing = store.list_scorecards(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if any(card["reviewer_user_id"] == context.user["id"] for card in existing):
        raise ApiError(
            status_code=409,
            code="scorecard_exists",
            message="You already submitted a scorecard for this application.",
        )
    scorecard = {
        "id": new_id("scd"),
        "tenant_id": context.tenant_id,
        "application_id": application_id,
        "reviewer_user_id": context.user["id"],
        "scores": payload.scores,
        "recommendation": payload.recommendation,
        "note": payload.note,
        "created_at": utc_now(),
    }
    store.create_scorecard(conn, scorecard)
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="scorecard.created",
        resource_type="application",
        resource_id=application_id,
        new_state={"recommendation": payload.recommendation},
    )
    conn.commit()
    return {"scorecard": {**scorecard, "reviewer_name": context.user["display_name"]}}


@router.get("/analytics/pipeline")
async def pipeline_analytics(
    conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    require_role(context, EMPLOYER_ROLES)
    applications = store.list_applications_for_tenant(conn, tenant_id=context.tenant_id)
    postings = store.list_postings(conn, tenant_id=context.tenant_id)
    by_category: dict[str, int] = {}
    for application in applications:
        by_category[application["stage_category"]] = (
            by_category.get(application["stage_category"], 0) + 1
        )
    return {
        "analytics": {
            "total_postings": len(postings),
            "published_postings": sum(1 for p in postings if p["status"] == "published"),
            "total_applications": len(applications),
            "applications_by_category": by_category,
            "hired": by_category.get("hired", 0),
            "rejected": by_category.get("rejected", 0),
            "in_flight": sum(
                count
                for category, count in by_category.items()
                if category not in ("hired", "rejected", "withdrawn", "closed")
            ),
        }
    }


class CompanyDecisionRequest(BaseModel):
    decision: str = Field(min_length=1)
    message: str = Field(default="")

_ACCEPTANCE_DECISIONS = {"accepted", "accept", "hired", "offer", "selected"}
_REJECTION_DECISIONS = {"rejected", "reject", "declined"}


@router.post("/applications/{application_id}/decision", status_code=200)
async def company_decision(
    application_id: str,
    payload: CompanyDecisionRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    require_role(context, PIPELINE_ROLES)
    application = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")

    candidate = store.get_candidate(conn, application["candidate_id"])
    posting = store.get_posting(
        conn, tenant_id=context.tenant_id, posting_id=application["posting_id"]
    )
    user = store.get_user(conn, candidate["user_id"]) if candidate else None
    org = store.get_organization(conn, context.tenant_id)

    if user and posting and org:
        decision = payload.decision.strip().lower()
        if decision in _ACCEPTANCE_DECISIONS:
            template_key = mail_templates.TEMPLATE_ACCEPTANCE
        elif decision in _REJECTION_DECISIONS:
            template_key = mail_templates.TEMPLATE_REJECTION
        else:
            template_key = mail_templates.TEMPLATE_STAGE_UPDATE
        workflow = _workflow_for(posting)
        stage = workflow.stage_by_id(application["stage_id"])
        try:
            await mail_templates.send_templated_email(
                conn,
                tenant_id=context.tenant_id,
                template_key=template_key,
                to_email=user["email"],
                context={
                    "candidate_name": user["display_name"],
                    "job_title": posting["title"],
                    "organization_name": org["name"],
                    "stage_label": (stage or {}).get("label", application["stage_id"]),
                    "status": payload.decision,
                    "decision": payload.decision,
                    "message": payload.message,
                    "applications_url": f"{settings.public_base_url}/candidate/applications",
                },
                settings=settings,
            )
        except Exception as exc:  # mail must never break the decision request
            logger.error(f"Decision email failed: {exc}")
    return {"status": "decision_sent"}


@router.get("/applications/{application_id}/candidate-avatar")
async def get_candidate_avatar(
    application_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
) -> FileResponse:
    """Serve the candidate's profile photo to staff reviewing the application."""
    require_role(context, EMPLOYER_ROLES)
    application = store.get_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    candidate = store.get_candidate(conn, application["candidate_id"])
    user = store.get_user(conn, candidate["user_id"]) if candidate else None
    resolved = resolve_avatar(settings, avatar_path=(user or {}).get("avatar_path"))
    if resolved is None:
        raise ApiError(
            status_code=404,
            code="avatar_not_found",
            message="Candidate has no profile photo on file.",
        )
    path, content_type = resolved
    return FileResponse(path, media_type=content_type)
