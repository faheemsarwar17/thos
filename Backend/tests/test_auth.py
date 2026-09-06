"""Authentication and organization onboarding tests."""

from fastapi.testclient import TestClient

from tests.conftest import as_identity


def _register(client: TestClient, email: str, name: str = "User") -> dict:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "display_name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_login_refresh_logout(client: TestClient) -> None:
    body = _register(client, "fresh.candidate@example.com", "Fresh Candidate")
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["candidate_id"]

    me = client.get("/api/v1/me", headers=_bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "fresh.candidate@example.com"

    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}
    )
    assert refreshed.status_code == 200
    new_refresh = refreshed.json()["refresh_token"]

    replay = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}
    )
    assert replay.status_code == 401

    logged_in = client.post(
        "/api/v1/auth/login",
        json={"email": "fresh.candidate@example.com", "password": "Password123!"},
    )
    assert logged_in.status_code == 200

    logout = client.post("/api/v1/auth/logout", json={"refresh_token": new_refresh})
    assert logout.status_code == 200
    after_logout = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": new_refresh}
    )
    assert after_logout.status_code == 401


def test_invalid_login(client: TestClient) -> None:
    _register(client, "someone@example.com", "Someone")
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": "someone@example.com", "password": "wrong-password"},
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"


def test_org_application_pending_then_verify(client: TestClient) -> None:
    owner = _register(client, "founder@acme.test", "Founder")
    owner_headers = _bearer(owner["access_token"])

    applied = client.post(
        "/api/v1/organizations/applications",
        headers=owner_headers,
        json={
            "name": "Acme Education",
            "legal_name": "Acme Education Pvt Ltd",
            "domain": "acme.test",
            "contact_email": "hr@acme.test",
            "contact_phone": "+92-300-0000000",
            "address": "Karachi",
            "idempotency_key": "org-app-1",
        },
    )
    assert applied.status_code == 201
    org_id = applied.json()["organization"]["id"]
    assert applied.json()["organization"]["verification_status"] == "pending"

    denied = client.get("/api/v1/pipeline", headers=owner_headers)
    assert denied.status_code == 403

    superadmin = _register(client, "superadmin@thos.local", "Super")
    assert superadmin["is_superadmin"] is True
    admin_headers = _bearer(superadmin["access_token"])

    pending = client.get("/api/v1/admin/organizations/pending", headers=admin_headers)
    assert pending.status_code == 200
    assert any(o["id"] == org_id for o in pending.json()["organizations"])

    verified = client.post(
        f"/api/v1/admin/organizations/{org_id}/verify", headers=admin_headers
    )
    assert verified.status_code == 200
    assert verified.json()["organization"]["verification_status"] == "verified"

    pipeline = client.get("/api/v1/pipeline", headers=owner_headers)
    assert pipeline.status_code == 200


def test_staff_create_requires_company_domain(client: TestClient) -> None:
    founder = _register(client, "ceo@school.edu", "CEO")
    founder_headers = _bearer(founder["access_token"])
    app = client.post(
        "/api/v1/organizations/applications",
        headers=founder_headers,
        json={
            "name": "School Edu",
            "legal_name": "School Edu",
            "domain": "school.edu",
            "contact_email": "hr@school.edu",
            "contact_phone": "+92-111",
            "address": "Lahore",
            "idempotency_key": "school-1",
        },
    )
    assert app.status_code == 201
    org_id = app.json()["organization"]["id"]

    superadmin = _register(client, "superadmin@thos.local", "Super")
    admin_headers = _bearer(superadmin["access_token"])
    verified = client.post(
        f"/api/v1/admin/organizations/{org_id}/verify", headers=admin_headers
    )
    assert verified.status_code == 200

    bad = client.post(
        "/api/v1/organizations/current/members",
        headers=founder_headers,
        json={
            "email": "person@gmail.com",
            "display_name": "Person",
            "role": "recruiter",
        },
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "staff_email_domain_mismatch"

    good = client.post(
        "/api/v1/organizations/current/members",
        headers=founder_headers,
        json={
            "email": "recruiter@school.edu",
            "display_name": "Recruiter",
            "role": "recruiter",
        },
    )
    assert good.status_code == 201

    blocked = client.get("/api/v1/candidates/me/profile", headers=founder_headers)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "employer_account_cannot_be_candidate"


def test_development_header_still_works_without_bearer(client: TestClient) -> None:
    response = client.get("/api/v1/me", headers=as_identity("header-user"))
    assert response.status_code == 200
    assert response.json()["user"]["identity"] == "header-user"
