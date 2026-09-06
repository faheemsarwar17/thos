"""Integration tests for AI Job Description Generation and Work Mode selection."""

from fastapi.testclient import TestClient

ADMIN = {"X-Development-Identity": "jd-admin-user"}


def test_generate_job_description_endpoint(client: TestClient) -> None:
    # Setup organization
    client.post(
        "/api/v1/organizations",
        headers=ADMIN,
        json={"name": "AI Innovation Labs", "idempotency_key": "jd-org-1"},
    )
    client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "education"},
    )

    # Test generating job description
    res = client.post(
        "/api/v1/postings/generate-description",
        headers=ADMIN,
        json={
            "title": "Staff Cloud Systems Architect",
            "location": "San Francisco, CA",
            "work_mode": "hybrid",
            "pack_id": "education",
            "employment_type": "full_time",
            "notes": "Looking for experience in distributed high-availability kubernetes clusters.",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "description" in data
    desc = data["description"]
    assert len(desc) > 100
    assert "Responsibilities" in desc or "Overview" in desc
    assert "hybrid" in desc.lower() or "hybrid" in desc
    assert "san francisco" in desc.lower() or "california" in desc.lower() or "flexible" in desc.lower()


def test_create_posting_with_work_mode(client: TestClient) -> None:
    # Setup org & workflow
    client.post(
        "/api/v1/organizations",
        headers=ADMIN,
        json={"name": "Workplace Corp", "idempotency_key": "wp-org-1"},
    )
    client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN,
        json={"pack_id": "education"},
    )
    client.post("/api/v1/workflows", headers=ADMIN, json={})

    # Create posting with work_mode = remote
    res = client.post(
        "/api/v1/postings",
        headers=ADMIN,
        json={
            "title": "Principal Python Developer",
            "location": "Austin, TX",
            "work_mode": "remote",
            "description": "Lead core backend systems.",
            "pack_id": "education",
            "idempotency_key": "wp-post-1",
        },
    )
    assert res.status_code == 201
    posting = res.json()["posting"]
    assert posting["title"] == "Principal Python Developer"
    assert posting["location"] == "Austin, TX"
    assert posting["work_mode"] == "remote"

    # Get posting
    get_res = client.get(f"/api/v1/postings/{posting['id']}", headers=ADMIN)
    assert get_res.status_code == 200
    fetched = get_res.json()["posting"]
    assert fetched["work_mode"] == "remote"
    assert fetched["location"] == "Austin, TX"
