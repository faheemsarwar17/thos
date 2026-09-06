from fastapi.testclient import TestClient

ADMIN = {"X-Development-Identity": "wf-admin"}


def _create_org(client: TestClient) -> None:
    client.post(
        "/api/v1/organizations",
        headers=ADMIN,
        json={"name": "Workflow University", "idempotency_key": "wf-org"},
    )


def test_unknown_workflow_component_is_rejected(client: TestClient) -> None:
    _create_org(client)
    unknown = client.put(
        "/api/v1/workflows/current",
        headers=ADMIN,
        json={"components": ["screening", "made_up_stage"]},
    )
    assert unknown.status_code == 422
    assert unknown.json()["error"]["code"] == "invalid_workflow"


def test_company_workflow_is_assembled_from_components(client: TestClient) -> None:
    _create_org(client)
    catalog = client.get("/api/v1/workflows/components", headers=ADMIN)
    assert catalog.status_code == 200
    ids = {item["id"] for item in catalog.json()["components"]}
    assert {"screening", "shortlisting", "ai_interview", "offer"} <= ids
    fixed = {item["id"] for item in catalog.json()["fixed_stages"]}
    assert fixed == {"received", "hired", "rejected", "withdrawn"}

    created = client.post("/api/v1/workflows", headers=ADMIN, json={})
    assert created.status_code == 201
    first = created.json()["workflow"]
    assert first["template_name"] == "company"
    assert "ai_interview" in first["components"]

    duplicate = client.post("/api/v1/workflows", headers=ADMIN, json={})
    assert duplicate.status_code == 409

    updated = client.put(
        "/api/v1/workflows/current",
        headers=ADMIN,
        json={"components": ["screening", "ai_interview"]},
    )
    assert updated.status_code == 200
    body = updated.json()["workflow"]
    assert body["components"] == ["screening", "ai_interview"]
    stage_ids = [stage["id"] for stage in body["stages"]]
    assert stage_ids == [
        "received",
        "screened",
        "applied_interview",
        "hired",
        "rejected",
        "withdrawn",
    ]
    assert body["version"] >= first["version"]

    listed = client.get("/api/v1/workflows", headers=ADMIN).json()["workflows"]
    assert len(listed) == 1
    assert listed[0]["id"] == body["id"]


def test_custom_domain_pack_crud_and_delete_guard(client: TestClient) -> None:
    _create_org(client)
    created = client.post(
        "/api/v1/domain-packs",
        headers=ADMIN,
        json={
            "pack_id": "healthcare",
            "display_name": "Healthcare Pack",
            "domain": "Clinical hiring",
            "skills": ["patient care", "triage"],
            "profile_questions": [
                {
                    "id": "hc-pi-01",
                    "prompt": "How would you triage competing clinical priorities on a busy ward?",
                    "competency": "clinical judgment",
                    "expected_concepts": ["triage", "safety"],
                }
            ],
            "applied_questions": [
                {
                    "id": "hc-ai-01",
                    "prompt": "Draft a 30-day onboarding plan for a new clinical hire.",
                    "competency": "onboarding",
                    "expected_concepts": ["training", "shadowing"],
                }
            ],
        },
    )
    assert created.status_code == 201
    assert created.json()["pack"]["source"] == "custom"

    detail = client.get("/api/v1/domain-packs/healthcare", headers=ADMIN)
    assert detail.status_code == 200
    assert detail.json()["pack"]["manifest"]["pack_id"] == "healthcare"

    patched = client.patch(
        "/api/v1/domain-packs/healthcare",
        headers=ADMIN,
        json={"display_name": "Healthcare Pack Updated", "skills": ["patient care", "triage", "docs"]},
    )
    assert patched.status_code == 200
    assert patched.json()["pack"]["display_name"] == "Healthcare Pack Updated"

    activation = client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "healthcare"},
    )
    assert activation.status_code == 201

    client.post("/api/v1/workflows", headers=ADMIN, json={})
    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={
            "title": "Clinical Lecturer",
            "pack_id": "healthcare",
            "idempotency_key": "hc-job",
        },
    )
    assert posting.status_code == 201
    assert posting.json()["posting"]["pack_id"] == "healthcare"

    blocked = client.delete("/api/v1/domain-packs/healthcare", headers=ADMIN)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "pack_in_use"


def test_pack_activation_and_pinning_on_posting(client: TestClient) -> None:
    _create_org(client)
    unknown = client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "does-not-exist"},
    )
    assert unknown.status_code == 404

    activation = client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "education"},
    )
    assert activation.status_code == 201
    assert activation.json()["activation"]["pack_version"] == "1.0.0"

    client.post("/api/v1/workflows", headers=ADMIN, json={})
    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={"title": "Pinned Posting", "pack_id": "education", "idempotency_key": "pin"},
    ).json()["posting"]
    assert posting["pack_id"] == "education"
    assert posting["pack_version"] == "1.0.0"
    assert posting["workflow_snapshot"]["version"] >= 1


def test_locked_pool_is_immutable(client: TestClient) -> None:
    _create_org(client)
    client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "education"},
    )
    client.post("/api/v1/workflows", headers=ADMIN, json={})
    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={"title": "Pool Posting", "pack_id": "education", "idempotency_key": "pool"},
    ).json()["posting"]

    pool = client.post(
        f"/api/v1/postings/{posting['id']}/question-pool/generate", headers=ADMIN
    ).json()["question_pool"]

    curated = client.patch(
        f"/api/v1/postings/{posting['id']}/question-pool",
        headers=ADMIN,
        json={"questions": pool["questions"][:2]},
    )
    assert curated.status_code == 200
    assert len(curated.json()["question_pool"]["questions"]) == 2

    locked = client.post(
        f"/api/v1/postings/{posting['id']}/question-pool/lock", headers=ADMIN
    )
    assert locked.status_code == 200

    after_lock = client.patch(
        f"/api/v1/postings/{posting['id']}/question-pool",
        headers=ADMIN,
        json={"questions": pool["questions"][:1]},
    )
    assert after_lock.status_code == 409
    assert after_lock.json()["error"]["code"] == "question_pool_locked"

    regenerate = client.post(
        f"/api/v1/postings/{posting['id']}/question-pool/generate", headers=ADMIN
    )
    assert regenerate.status_code == 409


def test_software_engineering_pack_is_available_and_talent_search_works(client: TestClient) -> None:
    _create_org(client)
    catalog = client.get("/api/v1/packs/catalog", headers=ADMIN)
    assert catalog.status_code == 200
    ids = {pack["pack_id"] for pack in catalog.json()["packs"]}
    assert "education" in ids
    assert "software-engineering" in ids

    client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "software-engineering"},
    )
    client.post("/api/v1/workflows", headers=ADMIN, json={})
    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={
            "title": "Backend Engineer",
            "pack_id": "software-engineering",
            "idempotency_key": "se-job",
        },
    )
    assert posting.status_code == 201
    assert posting.json()["posting"]["pack_id"] == "software-engineering"

    talent = client.get("/api/v1/talent", headers=ADMIN)
    assert talent.status_code == 200
    assert "results" in talent.json()


def test_workspace_search_returns_matching_postings(client: TestClient) -> None:
    _create_org(client)
    client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "education"},
    )
    client.post("/api/v1/workflows", headers=ADMIN, json={})
    client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={
            "title": "Lecturer in Mathematics",
            "pack_id": "education",
            "idempotency_key": "search-job",
        },
    )

    empty = client.get("/api/v1/search?q=a", headers=ADMIN)
    assert empty.status_code == 200
    assert empty.json()["postings"] == []

    found = client.get("/api/v1/search?q=mathematics", headers=ADMIN)
    assert found.status_code == 200
    titles = [item["title"] for item in found.json()["postings"]]
    assert "Lecturer in Mathematics" in titles
