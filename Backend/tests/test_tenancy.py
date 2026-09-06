"""Cross-tenant denial suite (rules.md §2.1/§2.2, phases.md Phase 1 exit)."""

from fastapi.testclient import TestClient

ADMIN_A = {"X-Development-Identity": "admin-a"}
ADMIN_B = {"X-Development-Identity": "admin-b"}


def _create_org(client: TestClient, headers: dict[str, str], name: str) -> str:
    response = client.post(
        "/api/v1/organizations",
        headers=headers,
        json={"name": name, "org_type": "university", "idempotency_key": f"org-{name}"},
    )
    assert response.status_code == 201
    return response.json()["organization"]["id"]


def test_user_without_membership_is_denied(client: TestClient) -> None:
    response = client.get(
        "/api/v1/organizations/current", headers={"X-Development-Identity": "stranger"}
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_cross_tenant_org_header_is_denied_without_existence_leakage(
    client: TestClient,
) -> None:
    org_a = _create_org(client, ADMIN_A, "Tenant A University")
    _create_org(client, ADMIN_B, "Tenant B College")

    # Admin B names Tenant A's real org id: denied.
    real = client.get(
        "/api/v1/organizations/current",
        headers={**ADMIN_B, "X-Organization-Id": org_a},
    )
    assert real.status_code == 403

    # Admin B names a nonexistent org id: identical response shape/code.
    fake = client.get(
        "/api/v1/organizations/current",
        headers={**ADMIN_B, "X-Organization-Id": "org_does_not_exist"},
    )
    assert fake.status_code == 403
    assert real.json()["error"]["code"] == fake.json()["error"]["code"]
    assert real.json()["error"]["message"] == fake.json()["error"]["message"]


def test_tenant_b_cannot_read_tenant_a_postings_or_pipeline(client: TestClient) -> None:
    org_a = _create_org(client, ADMIN_A, "Tenant A University")
    _create_org(client, ADMIN_B, "Tenant B College")

    client.post(
        "/api/v1/organizations/current/domain-packs/activations",
        headers=ADMIN_A,
        json={"pack_id": "education"},
    )
    client.post("/api/v1/workflows", headers=ADMIN_A, json={})

    posting = client.post(
        "/api/v1/postings",
        headers=ADMIN_A,
        json={"title": "Tenant A Lecturer", "pack_id": "education", "idempotency_key": "p1"},
    ).json()["posting"]

    # Tenant B listing does not include Tenant A's posting.
    b_postings = client.get("/api/v1/postings", headers=ADMIN_B).json()["postings"]
    assert all(p["id"] != posting["id"] for p in b_postings)

    # Direct object access is a nondisclosing 404.
    direct = client.get(f"/api/v1/postings/{posting['id']}", headers=ADMIN_B)
    assert direct.status_code == 404

    # Pipeline scoped to tenant B never returns tenant A applications.
    pipeline = client.get("/api/v1/pipeline", headers=ADMIN_B)
    assert pipeline.status_code == 200
    assert pipeline.json()["columns"] == []

    # Tenant A still sees its own posting via its tenant scope.
    own = client.get(
        f"/api/v1/postings/{posting['id']}",
        headers={**ADMIN_A, "X-Organization-Id": org_a},
    )
    assert own.status_code == 200


def test_role_enforcement_blocks_non_admin_configuration(client: TestClient) -> None:
    _create_org(client, ADMIN_A, "Tenant A University")
    member = client.post(
        "/api/v1/organizations/current/members",
        headers=ADMIN_A,
        json={
            "email": "reviewer.only@example.test",
            "display_name": "Reviewer Only",
            "role": "reviewer",
        },
    )
    assert member.status_code == 201
    reviewer = {"X-Development-Identity": member.json()["user"]["identity"]}
    denied = client.post("/api/v1/workflows", headers=reviewer, json={})
    assert denied.status_code == 403
    denied_posting = client.post(
        "/api/v1/postings",
        headers=reviewer,
        json={"title": "Should not exist", "idempotency_key": "np"},
    )
    assert denied_posting.status_code == 403


def test_candidate_cannot_use_employer_endpoints(client: TestClient) -> None:
    candidate = {"X-Development-Identity": "pure-candidate"}
    for path in ("/api/v1/pipeline", "/api/v1/postings", "/api/v1/organizations/current"):
        response = client.get(path, headers=candidate)
        assert response.status_code == 403, path
