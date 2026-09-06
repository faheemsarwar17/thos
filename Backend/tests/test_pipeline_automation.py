"""Integration tests for automated screening, top-N shortlisting, interview invitations, and AI feedback."""

from fastapi.testclient import TestClient

ADMIN = {"X-Development-Identity": "auto-admin"}
CANDIDATE_1 = {"X-Development-Identity": "auto-cand-1"}
CANDIDATE_2 = {"X-Development-Identity": "auto-cand-2"}
CANDIDATE_3 = {"X-Development-Identity": "auto-cand-3"}


def _setup_org_job_and_candidates(client: TestClient) -> tuple[str, list[str]]:
    """Set up organization, published job, and 3 candidate applications."""
    # Org setup
    assert client.post(
        "/api/v1/organizations",
        headers=ADMIN,
        json={"name": "Automation Academy", "idempotency_key": "auto-org-1"},
    ).status_code == 201

    assert client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "education"},
    ).status_code == 201

    assert client.post("/api/v1/workflows", headers=ADMIN, json={}).status_code == 201

    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={"title": "Data Science Instructor", "pack_id": "education", "idempotency_key": "auto-post-1"},
    ).json()["posting"]

    client.post(f"/api/v1/postings/{posting['id']}/question-pool/generate", headers=ADMIN)
    client.post(f"/api/v1/postings/{posting['id']}/question-pool/lock", headers=ADMIN)
    assert client.post(f"/api/v1/postings/{posting['id']}/publish", headers=ADMIN).status_code == 200

    app_ids = []
    for cand_headers, ident in [(CANDIDATE_1, "c1"), (CANDIDATE_2, "c2"), (CANDIDATE_3, "c3")]:
        client.post(
            "/api/v1/candidates/consent",
            headers=cand_headers,
            json={"terms_accepted": True, "privacy_accepted": True, "voice_recording_consent": True},
        )
        res = client.post(
            "/api/v1/applications",
            headers=cand_headers,
            json={"posting_id": posting["id"], "answers": {}, "idempotency_key": f"apply-{ident}"},
        )
        assert res.status_code == 201
        app_ids.append(res.json()["application"]["id"])

    return posting["id"], app_ids


def test_screen_received_applications(client: TestClient) -> None:
    posting_id, app_ids = _setup_org_job_and_candidates(client)

    # All 3 applications should initially be in 'received'
    pipeline_res = client.get(f"/api/v1/pipeline?posting_id={posting_id}", headers=ADMIN)
    assert pipeline_res.status_code == 200

    # Screen all received applications
    screen_res = client.post(
        "/api/v1/pipeline/screen-received",
        headers=ADMIN,
        json={"posting_id": posting_id},
    )
    assert screen_res.status_code == 200
    data = screen_res.json()
    assert data["screened_count"] == 3
    assert set(data["screened_ids"]) == set(app_ids)

    # Verify pipeline reflects 'screened'
    updated_pipeline = client.get(f"/api/v1/pipeline?posting_id={posting_id}", headers=ADMIN).json()
    screened_col = next(c for c in updated_pipeline["columns"] if c["stage_id"] == "screened")
    assert len(screened_col["cards"]) == 3


def test_shortlist_top_n_with_rejections_and_ai_feedback(client: TestClient) -> None:
    posting_id, app_ids = _setup_org_job_and_candidates(client)

    # Screen them first
    client.post(
        "/api/v1/pipeline/screen-received",
        headers=ADMIN,
        json={"posting_id": posting_id},
    )

    # Auto-shortlist top 1, reject the remaining 2 with AI feedback
    shortlist_res = client.post(
        "/api/v1/pipeline/shortlist",
        headers=ADMIN,
        json={
            "posting_id": posting_id,
            "top_n": 1,
            "reject_remaining": True,
            "send_ai_feedback": True,
        },
    )
    assert shortlist_res.status_code == 200
    data = shortlist_res.json()
    assert data["shortlisted_count"] == 1
    assert data["rejected_count"] == 2

    # Check candidate 2's application view to verify AI improvement feedback is available
    cand_apps = client.get("/api/v1/candidates/me/applications", headers=CANDIDATE_2).json()
    assert len(cand_apps["applications"]) == 1
    app = cand_apps["applications"][0]
    assert app["status"] == "Decision"
    assert app["ai_improvement_feedback"] is not None
    assert "Key Gaps" in app["ai_improvement_feedback"] or "Improvement Roadmap" in app["ai_improvement_feedback"]


def test_invite_interviews_with_rejections(client: TestClient) -> None:
    posting_id, app_ids = _setup_org_job_and_candidates(client)

    # Screen and shortlist 2 candidates
    client.post(
        "/api/v1/pipeline/screen-received",
        headers=ADMIN,
        json={"posting_id": posting_id},
    )
    client.post(
        "/api/v1/pipeline/shortlist",
        headers=ADMIN,
        json={
            "posting_id": posting_id,
            "application_ids": [app_ids[0], app_ids[1]],
            "reject_remaining": False,
        },
    )

    # Invite 1 to interview, reject the other
    invite_res = client.post(
        "/api/v1/pipeline/invite-interviews",
        headers=ADMIN,
        json={
            "posting_id": posting_id,
            "application_ids": [app_ids[0]],
            "reject_remaining": True,
            "send_ai_feedback": True,
        },
    )
    assert invite_res.status_code == 200
    data = invite_res.json()
    assert data["invited_count"] == 1
    assert data["rejected_count"] == 1
    assert data["invited_ids"] == [app_ids[0]]
    assert data["rejected_ids"] == [app_ids[1]]
