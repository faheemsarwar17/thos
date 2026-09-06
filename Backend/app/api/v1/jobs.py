"""Candidate-facing jobs, applications, and Applied Interviews.

Candidates only ever see published postings, their own applications,
and the four mapped candidate statuses — never internal stage names or
reviewer material (rules.md §7.2).
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import (
    CandidateContextDependency,
    CorrelationIdDependency,
    DbDependency,
)
from app.core.errors import ApiError
from app.core.ids import new_id
from app.db import store
from app.db.database import utc_now
from app.domain.evaluation import evaluate_scenario_responses
from app.domain.stages import CANDIDATE_STATUS_ORDER

router = APIRouter(tags=["jobs"])


def _candidate_status(posting: dict[str, Any], stage_id: str) -> str:
    snapshot = posting.get("workflow_snapshot") or {}
    mapping = snapshot.get("candidate_status_mapping") or {}
    return mapping.get(stage_id, "Under review")


def _job_body(conn, posting: dict[str, Any]) -> dict[str, Any]:
    org = store.get_organization(conn, posting["tenant_id"])
    return {
        "id": posting["id"],
        "title": posting["title"],
        "description": posting["description"],
        "location": posting["location"],
        "employment_type": posting["employment_type"],
        "organization_name": org["name"] if org else "",
        "published_at": posting["published_at"],
        "requires_applied_interview": posting["pool_status"] == "locked",
        "candidate_process": CANDIDATE_STATUS_ORDER,
    }


@router.get("/jobs")
async def list_jobs(conn: DbDependency, context: CandidateContextDependency) -> dict[str, Any]:
    postings = store.list_published_postings(conn)
    applications = store.list_applications_for_candidate(
        conn, candidate_id=context.candidate["id"]
    )
    applied_ids = {application["posting_id"] for application in applications}
    jobs = []
    for posting in postings:
        job = _job_body(conn, posting)
        job["already_applied"] = posting["id"] in applied_ids
        jobs.append(job)
    return {"jobs": jobs}


@router.get("/jobs/{posting_id}")
async def get_job(
    posting_id: str, conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    posting = store.get_published_posting(conn, posting_id)
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="This job is not available.")
    job = _job_body(conn, posting)
    application = store.find_application(
        conn, posting_id=posting_id, candidate_id=context.candidate["id"]
    )
    job["already_applied"] = application is not None
    job["application_id"] = application["id"] if application else None
    return {"job": job}


class ApplyRequest(BaseModel):
    posting_id: str = Field(min_length=1, max_length=64)
    answers: dict[str, str] = Field(default_factory=dict)
    idempotency_key: str = Field(min_length=1, max_length=128)


@router.post("/applications", status_code=201)
async def apply(
    payload: ApplyRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    posting = store.get_published_posting(conn, payload.posting_id)
    if posting is None:
        raise ApiError(
            status_code=404, code="not_found", message="This job is not open for applications."
        )
    cached = store.find_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.candidate["id"],
        operation="apply",
    )
    if cached:
        return cached

    existing = store.find_application(
        conn, posting_id=posting["id"], candidate_id=context.candidate["id"]
    )
    if existing:
        raise ApiError(
            status_code=409,
            code="already_applied",
            message="You already applied to this job. Check your applications for its status.",
        )

    snapshot = posting.get("workflow_snapshot") or {}
    stages = snapshot.get("stages") or []
    entry = next((s for s in stages if s["category"] == "new"), None)
    if entry is None:
        raise ApiError(
            status_code=409,
            code="posting_misconfigured",
            message="This job cannot accept applications right now. Try again later.",
        )

    score = store.best_profile_score(conn, candidate_id=context.candidate["id"])
    application = {
        "id": new_id("app"),
        "tenant_id": posting["tenant_id"],
        "posting_id": posting["id"],
        "candidate_id": context.candidate["id"],
        "stage_id": entry["id"],
        "stage_category": entry["category"],
        "stage_version": 1,
        # Immutable snapshot of the profile at application time.
        "profile_snapshot": dict(context.candidate["profile"]),
        "profile_interview_score": score,
        "answers": payload.answers,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    stored = store.create_application(conn, application)
    store.write_audit(
        conn,
        tenant_id=posting["tenant_id"],
        actor_user_id=context.user["id"],
        action="application.created",
        resource_type="application",
        resource_id=application["id"],
        new_state={"posting_id": posting["id"], "stage_id": entry["id"]},
    )
    store.emit_event(
        conn,
        event_name="APPLICATION_CREATED",
        tenant_id=posting["tenant_id"],
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="application",
        resource_id=application["id"],
        payload={"posting_id": posting["id"]},
    )
    body = {
        "application": {
            "id": stored["id"],
            "posting_id": posting["id"],
            "status": _candidate_status(posting, entry["id"]),
            "created_at": stored["created_at"],
        }
    }
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.candidate["id"],
        operation="apply",
        body=body,
    )
    conn.commit()
    return body


@router.get("/candidates/me/matches")
async def my_job_matches(
    conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    matches = store.list_matches_for_candidate(
        conn, candidate_id=context.candidate["id"]
    )
    return {"matches": matches, "count": len(matches)}


@router.get("/candidates/me/applications")
async def my_applications(
    conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    applications = store.list_applications_for_candidate(
        conn, candidate_id=context.candidate["id"]
    )
    items = []
    for application in applications:
        posting = store.get_published_posting(conn, application["posting_id"])
        if posting is None:
            # Closed/unpublished postings still show; read tenant-scoped.
            posting = store.get_posting(
                conn,
                tenant_id=application["tenant_id"],
                posting_id=application["posting_id"],
            )
        if posting is None:
            continue
        org = store.get_organization(conn, application["tenant_id"])
        attempt = store.get_applied_attempt_by_application(
            conn, application_id=application["id"]
        )
        status = _candidate_status(posting, application["stage_id"])
        sandbox_session = (attempt or {}).get("sandbox_session")
        items.append(
            {
                "id": application["id"],
                "job_title": posting["title"],
                "organization_name": org["name"] if org else "",
                "status": status,
                "status_order": CANDIDATE_STATUS_ORDER,
                "applied_at": application["created_at"],
                "updated_at": application["updated_at"],
                "job_match_score": application.get("job_match_score"),
                "job_match_reasons": application.get("job_match_reasons"),
                "ai_improvement_feedback": application.get("ai_improvement_feedback"),
                "applied_interview": (
                    {
                        "attempt_id": attempt["id"],
                        "status": attempt["status"],
                        "sandbox": {
                            "required": bool(posting.get("sandbox_required")),
                            "status": (
                                sandbox_session.get("status")
                                if isinstance(sandbox_session, dict)
                                else None
                            ),
                        },
                    }
                    if attempt
                    else None
                ),
            }
        )
    return {"applications": items}


@router.get("/candidates/me/applications/{application_id}/timeline")
async def application_timeline(
    application_id: str, conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    application = store.get_application_for_candidate(
        conn, candidate_id=context.candidate["id"], application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    posting = store.get_posting(
        conn, tenant_id=application["tenant_id"], posting_id=application["posting_id"]
    )
    if posting is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")
    current_status = _candidate_status(posting, application["stage_id"])
    current_index = CANDIDATE_STATUS_ORDER.index(current_status)

    # Derive candidate-safe step times from the transition log without
    # exposing internal stage names (rules.md §7.2).
    transitions = store.list_transitions(conn, application_id=application_id)
    status_times: dict[str, str] = {CANDIDATE_STATUS_ORDER[0]: application["created_at"]}
    snapshot_mapping = (posting.get("workflow_snapshot") or {}).get(
        "candidate_status_mapping"
    ) or {}
    for transition in transitions:
        mapped = snapshot_mapping.get(transition["to_stage_id"])
        if mapped and mapped not in status_times:
            status_times[mapped] = transition["occurred_at"]

    steps = []
    for index, status in enumerate(CANDIDATE_STATUS_ORDER):
        state = (
            "completed"
            if index < current_index
            else "current"
            if index == current_index
            else "upcoming"
        )
        steps.append(
            {
                "status": status,
                "state": state,
                "occurred_at": status_times.get(status),
            }
        )

    attempt = store.get_applied_attempt_by_application(conn, application_id=application_id)
    next_action = None
    if attempt and attempt["status"] in ("invited", "in_progress"):
        next_action = "Complete your Applied Interview."
    elif current_status == "Decision" and application["stage_category"] == "offer":
        next_action = "The hiring team is preparing a decision. Watch for an offer notice."
    elif current_status != "Decision":
        next_action = "No action needed from you right now."

    return {
        "timeline": {
            "application_id": application_id,
            "job_title": posting["title"],
            "current_status": current_status,
            "last_updated": application["updated_at"],
            "steps": steps,
            "next_action": next_action,
            "applied_interview": (
                {"attempt_id": attempt["id"], "status": attempt["status"]} if attempt else None
            ),
        }
    }


class WithdrawApplicationRequest(BaseModel):
    reason: str = Field(default="Candidate withdrew application", max_length=500)


@router.post("/candidates/me/applications/{application_id}/withdraw")
async def withdraw_application(
    application_id: str,
    payload: WithdrawApplicationRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
) -> dict[str, Any]:
    application = store.get_application_for_candidate(
        conn, candidate_id=context.candidate["id"], application_id=application_id
    )
    if application is None:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")

    if application["stage_category"] in ("hired", "rejected", "withdrawn", "closed"):
        raise ApiError(
            status_code=409,
            code="application_already_terminal",
            message=f"Application cannot be withdrawn because it is already {application['stage_category']}.",
        )

    from_stage_id = application["stage_id"]
    destination_stage_id = "withdrawn"
    destination_category = "withdrawn"

    cursor = conn.execute(
        """UPDATE applications
           SET stage_id=?, stage_category=?, stage_version=stage_version+1, updated_at=?
           WHERE id=? AND candidate_id=?""",
        (destination_stage_id, destination_category, utc_now(), application_id, context.candidate["id"]),
    )
    if cursor.rowcount != 1:
        raise ApiError(status_code=409, code="conflict", message="Unable to withdraw application.")

    transition = store.record_transition(
        conn,
        tenant_id=application["tenant_id"],
        application_id=application_id,
        from_stage_id=from_stage_id,
        to_stage_id=destination_stage_id,
        reason_code="candidate_withdrew",
        note=payload.reason,
        actor_user_id=context.user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=application["tenant_id"],
        actor_user_id=context.user["id"],
        action="application.withdrawn",
        resource_type="application",
        resource_id=application_id,
        old_state={"stage_id": from_stage_id},
        new_state={"stage_id": destination_stage_id},
        reason=payload.reason,
    )
    store.emit_event(
        conn,
        event_name="APPLICATION_WITHDRAWN",
        tenant_id=application["tenant_id"],
        actor_user_id=context.user["id"],
        correlation_id=new_id("cor"),
        resource_type="application",
        resource_id=application_id,
        payload={
            "from_stage_id": from_stage_id,
            "to_stage_id": destination_stage_id,
            "reason": payload.reason,
        },
    )
    conn.commit()
    return {
        "application_id": application_id,
        "status": "Decision",
        "stage_category": destination_category,
        "withdrawn_at": transition["occurred_at"],
    }



# --- candidate side of the Applied Interview -------------------------------------


def _public_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"id": q["id"], "prompt": q["prompt"], "competency": q["competency"]} for q in questions
    ]


@router.get("/candidates/me/applied-interviews/{attempt_id}")
async def get_applied_interview(
    attempt_id: str, conn: DbDependency, context: CandidateContextDependency
) -> dict[str, Any]:
    attempt = store.get_applied_attempt_for_candidate(
        conn, attempt_id=attempt_id, candidate_id=context.candidate["id"]
    )
    if attempt is None:
        raise ApiError(status_code=404, code="not_found", message="Interview not found.")
    return {
        "attempt": {
            "id": attempt["id"],
            "status": attempt["status"],
            "questions": _public_questions(attempt["questions"]),
            "responses": attempt["responses"],
            "invited_at": attempt["invited_at"],
            "submitted_at": attempt["submitted_at"],
        }
    }


class AppliedResponsesRequest(BaseModel):
    responses: dict[str, str]


@router.patch("/candidates/me/applied-interviews/{attempt_id}/responses")
async def save_applied_responses(
    attempt_id: str,
    payload: AppliedResponsesRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
) -> dict[str, Any]:
    attempt = store.get_applied_attempt_for_candidate(
        conn, attempt_id=attempt_id, candidate_id=context.candidate["id"]
    )
    if attempt is None:
        raise ApiError(status_code=404, code="not_found", message="Interview not found.")
    if attempt["status"] not in ("invited", "in_progress"):
        raise ApiError(
            status_code=409,
            code="attempt_already_submitted",
            message="This interview was already submitted and is immutable.",
        )
    known_ids = {q["id"] for q in attempt["questions"]}
    merged = dict(attempt["responses"])
    for question_id, text in payload.responses.items():
        if question_id not in known_ids:
            raise ApiError(
                status_code=422,
                code="unknown_question",
                message=f"Question '{question_id}' is not part of this interview.",
            )
        merged[question_id] = text[:20000]
    fields: dict[str, Any] = {"responses": merged}
    if attempt["status"] == "invited":
        fields["status"] = "in_progress"
        fields["started_at"] = utc_now()
    store.update_applied_attempt(conn, attempt_id=attempt_id, fields=fields)
    conn.commit()
    return {"saved": True, "responses": merged}


class SubmitAppliedRequest(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=128)


@router.post("/candidates/me/applied-interviews/{attempt_id}/submit")
async def submit_applied_interview(
    attempt_id: str,
    payload: SubmitAppliedRequest,
    conn: DbDependency,
    context: CandidateContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    attempt = store.get_applied_attempt_for_candidate(
        conn, attempt_id=attempt_id, candidate_id=context.candidate["id"]
    )
    if attempt is None:
        raise ApiError(status_code=404, code="not_found", message="Interview not found.")
    cached = store.find_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.candidate["id"],
        operation="submit_applied",
    )
    if cached:
        return cached
    if attempt["status"] not in ("invited", "in_progress"):
        raise ApiError(
            status_code=409,
            code="attempt_already_submitted",
            message="This interview was already submitted.",
        )

    posting = store.get_posting(
        conn, tenant_id=attempt["tenant_id"], posting_id=attempt["posting_id"]
    )
    rubric = ((posting or {}).get("question_pool") or {}).get("rubric_dimensions") or [
        {"id": "structure", "label": "Structure"},
        {"id": "reasoning", "label": "Reasoning"},
        {"id": "domain_correctness", "label": "Domain correctness"},
    ]
    evaluation = evaluate_scenario_responses(
        questions=attempt["questions"],
        responses=attempt["responses"],
        rubric_dimensions=rubric,
        pack_id=(posting or {}).get("pack_id") or "unknown",
        pack_version=(posting or {}).get("pack_version") or "unknown",
    )
    store.update_applied_attempt(
        conn,
        attempt_id=attempt_id,
        fields={"status": "evaluated", "evaluation": evaluation, "submitted_at": utc_now()},
    )
    store.emit_event(
        conn,
        event_name="APPLIED_INTERVIEW_SUBMITTED",
        tenant_id=attempt["tenant_id"],
        actor_user_id=context.user["id"],
        correlation_id=correlation_id,
        resource_type="applied_interview_attempt",
        resource_id=attempt_id,
    )
    body = {"attempt_id": attempt_id, "status": "evaluated", "submitted": True}
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=context.candidate["id"],
        operation="submit_applied",
        body=body,
    )
    conn.commit()
    return body
