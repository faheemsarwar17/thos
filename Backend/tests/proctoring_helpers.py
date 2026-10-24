"""Shared setup for the proctoring tests: an org, a posting, an invited applied attempt."""

from fastapi.testclient import TestClient

ADMIN = {"X-Development-Identity": "proc-admin"}
CANDIDATE = {"X-Development-Identity": "proc-candidate"}
OTHER_CANDIDATE = {"X-Development-Identity": "proc-other-candidate"}


def create_org_and_workflow(
    client: TestClient, headers: dict[str, str] = ADMIN, key: str = "proc-org"
) -> None:
    assert (
        client.post(
            "/api/v1/organizations",
            headers=headers,
            json={"name": f"Org {key}", "idempotency_key": key},
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/organizations/current/domain-packs/activations",
            headers=headers,
            json={"pack_id": "education"},
        ).status_code
        == 201
    )
    assert client.post("/api/v1/workflows", headers=headers, json={}).status_code == 201


def create_posting(
    client: TestClient, key: str, headers: dict[str, str] = ADMIN, **overrides
) -> dict:
    payload = {"title": "Assistant Professor", "pack_id": "education", "idempotency_key": key}
    payload.update(overrides)
    response = client.post("/api/v1/postings", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["posting"]


def publish_posting(client: TestClient, posting_id: str, headers: dict[str, str] = ADMIN) -> None:
    for suffix in ("question-pool/generate", "question-pool/lock", "publish"):
        response = client.post(f"/api/v1/postings/{posting_id}/{suffix}", headers=headers)
        assert response.status_code == 200, response.text


def invite_attempt(
    client: TestClient,
    posting_id: str,
    key_prefix: str = "proc",
    candidate: dict[str, str] = CANDIDATE,
) -> tuple[str, str]:
    """Candidate applies, admin invites. Returns (application_id, attempt_id)."""
    applied = client.post(
        "/api/v1/applications",
        headers=candidate,
        json={"posting_id": posting_id, "idempotency_key": f"{key_prefix}-apply"},
    )
    assert applied.status_code == 201, applied.text
    application_id = applied.json()["application"]["id"]
    invite = client.post(
        f"/api/v1/applications/{application_id}/applied-interview-invitations",
        headers=ADMIN,
        json={"idempotency_key": f"{key_prefix}-invite"},
    )
    assert invite.status_code == 201, invite.text
    return application_id, invite.json()["attempt"]["id"]


def applied_attempt(
    client: TestClient, key_prefix: str = "proc", **posting_overrides
) -> tuple[str, str]:
    """Org + published posting + invited attempt. Returns (application_id, attempt_id)."""
    create_org_and_workflow(client)
    posting = create_posting(client, f"{key_prefix}-post", **posting_overrides)
    publish_posting(client, posting["id"])
    return invite_attempt(client, posting["id"], key_prefix)


def profile_attempt(client: TestClient, candidate: dict[str, str] = CANDIDATE) -> str:
    response = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=candidate,
        json={"pack_id": "education"},
    )
    assert response.status_code == 201, response.text
    return response.json()["attempt"]["id"]
