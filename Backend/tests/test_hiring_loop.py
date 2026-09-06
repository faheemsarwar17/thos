"""End-to-end hiring loop: workflow → pack → job → apply → pipeline → decision."""

from fastapi.testclient import TestClient

ADMIN = {"X-Development-Identity": "loop-admin"}
CANDIDATE = {"X-Development-Identity": "loop-candidate"}


def _setup_org_with_published_job(client: TestClient) -> str:
    assert (
        client.post(
            "/api/v1/organizations",
            headers=ADMIN,
            json={"name": "Loop University", "idempotency_key": "loop-org"},
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/organizations/current/domain-packs/activations",
            headers=ADMIN,
            json={"pack_id": "education"},
        ).status_code
        == 201
    )
    assert client.post("/api/v1/workflows", headers=ADMIN, json={}).status_code == 201

    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={"title": "Assistant Professor", "pack_id": "education", "idempotency_key": "loop-post"},
    ).json()["posting"]

    # Publishing before the pool is locked must fail.
    early = client.post(f"/api/v1/postings/{posting['id']}/publish", headers=ADMIN)
    assert early.status_code == 422
    assert early.json()["error"]["code"] == "question_pool_not_locked"

    assert (
        client.post(
            f"/api/v1/postings/{posting['id']}/question-pool/generate", headers=ADMIN
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/postings/{posting['id']}/question-pool/lock", headers=ADMIN
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/v1/postings/{posting['id']}/publish", headers=ADMIN).status_code == 200
    )
    return posting["id"]


def test_full_hiring_loop(client: TestClient) -> None:
    posting_id = _setup_org_with_published_job(client)

    # Candidate discovers and applies exactly once (idempotent).
    jobs = client.get("/api/v1/jobs", headers=CANDIDATE).json()["jobs"]
    assert any(job["id"] == posting_id for job in jobs)

    apply_body = {"posting_id": posting_id, "idempotency_key": "loop-apply"}
    first = client.post("/api/v1/applications", headers=CANDIDATE, json=apply_body)
    assert first.status_code == 201
    retry = client.post("/api/v1/applications", headers=CANDIDATE, json=apply_body)
    assert retry.status_code == 201
    assert retry.json() == first.json()

    duplicate = client.post(
        "/api/v1/applications",
        headers=CANDIDATE,
        json={"posting_id": posting_id, "idempotency_key": "different-key"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "already_applied"

    application_id = first.json()["application"]["id"]

    # Candidate timeline shows the mapped status, never internal names.
    timeline = client.get(
        f"/api/v1/candidates/me/applications/{application_id}/timeline", headers=CANDIDATE
    ).json()["timeline"]
    assert timeline["current_status"] == "Application received"
    assert "Received" not in str(timeline)

    # Employer moves the candidate through validated stages.
    pipeline = client.get("/api/v1/pipeline", headers=ADMIN).json()["columns"]
    card = next(c for col in pipeline for c in col["cards"] if c["id"] == application_id)
    assert card["stage_id"] == "received"
    destinations = {d["id"] for d in card["valid_destinations"]}
    assert "screened" in destinations and "rejected" in destinations
    assert "hired" not in destinations  # cannot skip to a terminal stage

    move = client.post(
        f"/api/v1/applications/{application_id}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": "screened",
            "from_stage_version": card["stage_version"],
            "idempotency_key": "t1",
        },
    )
    assert move.status_code == 200
    assert move.json()["application"]["stage_id"] == "screened"

    # Stale version returns a conflict, never a silent overwrite.
    stale = client.post(
        f"/api/v1/applications/{application_id}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": "shortlisted",
            "from_stage_version": card["stage_version"],
            "idempotency_key": "t-stale",
        },
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "application_stage_conflict"

    # Idempotent transition retry returns the recorded response.
    replay = client.post(
        f"/api/v1/applications/{application_id}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": "screened",
            "from_stage_version": card["stage_version"],
            "idempotency_key": "t1",
        },
    )
    assert replay.status_code == 200
    assert replay.json() == move.json()

    version = move.json()["application"]["stage_version"]
    for step, (to_stage, key) in enumerate(
        [("shortlisted", "t2"), ("applied_interview", "t3")], start=0
    ):
        response = client.post(
            f"/api/v1/applications/{application_id}/transitions",
            headers=ADMIN,
            json={
                "to_stage_id": to_stage,
                "from_stage_version": version + step,
                "idempotency_key": key,
            },
        )
        assert response.status_code == 200, response.text

    # Applied Interview: invite, complete, submit (immutable afterwards).
    invite = client.post(
        f"/api/v1/applications/{application_id}/applied-interview-invitations",
        headers=ADMIN,
        json={"idempotency_key": "inv1"},
    )
    assert invite.status_code == 201
    attempt_id = invite.json()["attempt"]["id"]

    attempt = client.get(
        f"/api/v1/candidates/me/applied-interviews/{attempt_id}", headers=CANDIDATE
    ).json()["attempt"]
    # Grading keys are never exposed to candidates.
    assert all("expected_concepts" not in q for q in attempt["questions"])

    responses = {
        q["id"]: (
            "I would begin with the learning outcomes and build a weekly plan with a "
            "formative assessment checkpoint. Clear rubric criteria keep grading fair. "
            "I would gather feedback and adjust pacing so students stay supported."
        )
        for q in attempt["questions"]
    }
    saved = client.patch(
        f"/api/v1/candidates/me/applied-interviews/{attempt_id}/responses",
        headers=CANDIDATE,
        json={"responses": responses},
    )
    assert saved.status_code == 200

    submit = client.post(
        f"/api/v1/candidates/me/applied-interviews/{attempt_id}/submit",
        headers=CANDIDATE,
        json={"idempotency_key": "sub1"},
    )
    assert submit.status_code == 200
    locked = client.patch(
        f"/api/v1/candidates/me/applied-interviews/{attempt_id}/responses",
        headers=CANDIDATE,
        json={"responses": responses},
    )
    assert locked.status_code == 409

    # Employer sees the versioned evaluation; candidate response contains no
    # internal stage names or evaluation internals.
    detail = client.get(f"/api/v1/applications/{application_id}", headers=ADMIN).json()[
        "application"
    ]
    evaluation = detail["applied_interview"]["evaluation"]
    assert evaluation["evaluator_version"]
    assert evaluation["pack_version"]
    assert evaluation["requires_human_decision"] is True

    # Reviewer scorecard, then human-approved decision path with reason.
    scorecard = client.post(
        f"/api/v1/applications/{application_id}/scorecards",
        headers=ADMIN,
        json={"scores": {"structure": 80, "reasoning": 75}, "recommendation": "advance"},
    )
    assert scorecard.status_code == 201

    current_version = detail["stage_version"]
    no_reason = client.post(
        f"/api/v1/applications/{application_id}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": "offer",
            "from_stage_version": current_version,
            "idempotency_key": "t4",
        },
    )
    assert no_reason.status_code == 422
    assert no_reason.json()["error"]["code"] == "reason_required"

    offer = client.post(
        f"/api/v1/applications/{application_id}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": "offer",
            "from_stage_version": current_version,
            "reason_code": "panel_recommended",
            "idempotency_key": "t5",
        },
    )
    assert offer.status_code == 200

    hired = client.post(
        f"/api/v1/applications/{application_id}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": "hired",
            "from_stage_version": offer.json()["application"]["stage_version"],
            "reason_code": "offer_accepted",
            "idempotency_key": "t6",
        },
    )
    assert hired.status_code == 200
    assert hired.json()["application"]["stage_category"] == "hired"

    # Terminal stages have no outbound destinations.
    assert hired.json()["application"]["valid_destinations"] == []

    # Candidate sees "Decision", and the notification ledger recorded updates.
    timeline = client.get(
        f"/api/v1/candidates/me/applications/{application_id}/timeline", headers=CANDIDATE
    ).json()["timeline"]
    assert timeline["current_status"] == "Decision"

    notifications = client.get("/api/v1/notifications", headers=CANDIDATE).json()
    assert notifications["unread_count"] > 0

    # Audit trail exists for the whole loop.
    audit = client.get("/api/v1/organizations/current/audit", headers=ADMIN).json()[
        "audit_records"
    ]
    actions = {record["action"] for record in audit}
    assert {
        "organization.created",
        "domain_pack.activated",
        "workflow.created",
        "posting.published",
        "question_pool.locked",
        "application.transitioned",
        "applied_interview.invited",
        "scorecard.created",
    } <= actions
