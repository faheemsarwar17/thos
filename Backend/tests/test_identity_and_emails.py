"""PFP identity verification, stage-progression emails, and email template admin."""

import base64
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.services import mail as mail_service
from app.services.synthesis_service import _apply_identity_verdict

ADMIN = {"X-Development-Identity": "feat-admin"}
CANDIDATE = {"X-Development-Identity": "feat-candidate"}
CANDIDATE_EMAIL = "feat-candidate@example.test"

# 1x1 transparent PNG.
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
JPEG_DATA_URL = "data:image/jpeg;base64," + base64.b64encode(
    b"\xff\xd8\xff\xe0" + b"\x00" * 64
).decode()


@pytest.fixture(autouse=True)
def console_mail() -> Iterator[list]:
    """Every send in tests lands in the shared console adapter (no SMTP configured)."""
    mail_service._console_adapter.sent.clear()
    yield mail_service._console_adapter.sent
    mail_service._console_adapter.sent.clear()


def _setup_posting(client: TestClient) -> str:
    assert (
        client.post(
            "/api/v1/organizations",
            headers=ADMIN,
            json={"name": "Feature University", "idempotency_key": "feat-org"},
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
        json={"title": "Lecturer", "pack_id": "education", "idempotency_key": "feat-post"},
    ).json()["posting"]
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
        client.post(f"/api/v1/postings/{posting['id']}/publish", headers=ADMIN).status_code
        == 200
    )
    return posting["id"]


def _apply(client: TestClient, posting_id: str, key: str = "feat-apply") -> dict:
    response = client.post(
        "/api/v1/applications",
        headers=CANDIDATE,
        json={"posting_id": posting_id, "idempotency_key": key},
    )
    assert response.status_code == 201
    application_id = response.json()["application"]["id"]
    # The employer detail carries stage_version, needed for optimistic concurrency.
    detail = client.get(f"/api/v1/applications/{application_id}", headers=ADMIN)
    assert detail.status_code == 200
    return detail.json()["application"]


def _transition(
    client: TestClient, application: dict, to_stage: str, key: str, reason: str = ""
) -> dict:
    response = client.post(
        f"/api/v1/applications/{application['id']}/transitions",
        headers=ADMIN,
        json={
            "to_stage_id": to_stage,
            "from_stage_version": application["stage_version"],
            "reason_code": reason,
            "idempotency_key": key,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["application"]


# --- avatar (PFP) -----------------------------------------------------------


def test_avatar_upload_serve_and_delete(client: TestClient) -> None:
    upload = client.post(
        "/api/v1/me/avatar",
        headers=CANDIDATE,
        files={"file": ("avatar.png", PNG_BYTES, "image/png")},
    )
    assert upload.status_code == 201
    assert upload.json()["avatar"]["has_avatar"] is True

    me = client.get("/api/v1/me", headers=CANDIDATE).json()["user"]
    assert me["has_avatar"] is True
    assert me["avatar_url"] == "/api/v1/me/avatar"

    served = client.get("/api/v1/me/avatar", headers=CANDIDATE)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content == PNG_BYTES

    removed = client.delete("/api/v1/me/avatar", headers=CANDIDATE)
    assert removed.status_code == 200
    assert removed.json()["avatar"]["has_avatar"] is False
    assert client.get("/api/v1/me/avatar", headers=CANDIDATE).status_code == 404


def test_avatar_rejects_unsupported_type(client: TestClient) -> None:
    upload = client.post(
        "/api/v1/me/avatar",
        headers=CANDIDATE,
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert upload.status_code == 422
    assert upload.json()["error"]["code"] == "unsupported_avatar_type"


def test_employer_can_view_candidate_avatar(client: TestClient) -> None:
    client.post(
        "/api/v1/me/avatar",
        headers=CANDIDATE,
        files={"file": ("avatar.png", PNG_BYTES, "image/png")},
    )
    posting_id = _setup_posting(client)
    application = _apply(client, posting_id)

    detail = client.get(f"/api/v1/applications/{application['id']}", headers=ADMIN).json()[
        "application"
    ]
    assert detail["candidate_has_avatar"] is True
    assert detail["candidate_avatar_url"].endswith("/candidate-avatar")

    served = client.get(
        f"/api/v1/applications/{application['id']}/candidate-avatar", headers=ADMIN
    )
    assert served.status_code == 200
    assert served.content == PNG_BYTES

    # Candidates cannot read employer-scoped avatars.
    denied = client.get(
        f"/api/v1/applications/{application['id']}/candidate-avatar", headers=CANDIDATE
    )
    assert denied.status_code == 403


# --- live identity check -----------------------------------------------------


def test_identity_check_without_reference_photo(client: TestClient) -> None:
    attempt = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "education"},
    ).json()["attempt"]

    checked = client.post(
        f"/api/v1/candidates/me/profile-interview-attempts/{attempt['id']}/voice/identity-check",
        headers=CANDIDATE,
        json={"image": JPEG_DATA_URL},
    )
    assert checked.status_code == 200
    verdict = checked.json()["identity_verification"]
    assert verdict["status"] == "no_reference_photo"
    assert verdict["checked_at"]

    session = client.get(
        f"/api/v1/candidates/me/profile-interview-attempts/{attempt['id']}/voice",
        headers=CANDIDATE,
    ).json()
    assert session["identity_verification"]["status"] == "no_reference_photo"


def test_identity_check_ai_unavailable_and_invalid_image(client: TestClient) -> None:
    client.post(
        "/api/v1/me/avatar",
        headers=CANDIDATE,
        files={"file": ("avatar.png", PNG_BYTES, "image/png")},
    )
    attempt = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "education"},
    ).json()["attempt"]

    # Test settings have no AI key: the check records "unavailable", never blocks.
    checked = client.post(
        f"/api/v1/candidates/me/profile-interview-attempts/{attempt['id']}/voice/identity-check",
        headers=CANDIDATE,
        json={"image": JPEG_DATA_URL},
    )
    assert checked.status_code == 200
    assert checked.json()["identity_verification"]["status"] == "unavailable"

    bad = client.post(
        f"/api/v1/candidates/me/profile-interview-attempts/{attempt['id']}/voice/identity-check",
        headers=CANDIDATE,
        # Well-formed data URL but an unsupported image type.
        json={"image": "data:image/gif;base64," + "QUFB" * 8},
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "invalid_image"


def test_ambiguous_identity_is_stated_in_report() -> None:
    report = {"executive_summary": "Solid, structured answers.", "concerns": []}
    _apply_identity_verdict(
        report,
        {"status": "ambiguous", "confidence": 0.4, "detail": "Poor lighting.", "checked_at": "now"},
    )
    assert report["identity_verification"]["status"] == "ambiguous"
    assert any("ambiguous" in concern.lower() for concern in report["concerns"])
    assert "Identity note" in report["executive_summary"]

    clean = {"executive_summary": "Good.", "concerns": []}
    _apply_identity_verdict(
        clean, {"status": "match", "confidence": 0.97, "detail": "", "checked_at": "now"}
    )
    assert clean["concerns"] == []
    assert "Identity note" not in clean["executive_summary"]


# --- stage progression emails -------------------------------------------------


def test_stage_progression_emails_acceptance_and_rejection(
    client: TestClient, console_mail: list
) -> None:
    posting_id = _setup_posting(client)
    application = _apply(client, posting_id)

    application = _transition(client, application, "screened", "e-t1")
    assert len(console_mail) == 1
    update = console_mail[-1]
    assert update.to_email == CANDIDATE_EMAIL
    assert update.subject == "Application update: Lecturer at Feature University"
    assert "Screened" in update.body

    application = _transition(client, application, "shortlisted", "e-t2")
    application = _transition(client, application, "applied_interview", "e-t3")
    application = _transition(client, application, "offer", "e-t4", reason="panel_recommended")
    assert len(console_mail) == 4

    _transition(client, application, "hired", "e-t5", reason="offer_accepted")
    acceptance = console_mail[-1]
    assert acceptance.to_email == CANDIDATE_EMAIL
    assert acceptance.subject == "Great news: Lecturer at Feature University"
    assert "Congratulations" in acceptance.body


def test_rejection_email_on_reject_transition(
    client: TestClient, console_mail: list
) -> None:
    posting_id = _setup_posting(client)
    application = _apply(client, posting_id)
    application = _transition(client, application, "screened", "r-t1")
    _transition(client, application, "rejected", "r-t2", reason="not_a_fit")

    rejection = console_mail[-1]
    assert rejection.to_email == CANDIDATE_EMAIL
    assert rejection.subject == "Update on your application: Lecturer at Feature University"
    assert "will not be moving forward" in rejection.body


def test_custom_template_overrides_default(
    client: TestClient, console_mail: list
) -> None:
    posting_id = _setup_posting(client)

    updated = client.put(
        "/api/v1/organizations/current/email-templates/stage_update",
        headers=ADMIN,
        json={
            "subject": "Custom update for {job_title}",
            "body": "Hi {candidate_name}, custom note for {stage_label} at {organization_name}.",
        },
    )
    assert updated.status_code == 200

    application = _apply(client, posting_id)
    _transition(client, application, "screened", "c-t1")
    sent = console_mail[-1]
    assert sent.subject == "Custom update for Lecturer"
    assert "custom note for Screened at Feature University" in sent.body


def test_company_decision_uses_templates(
    client: TestClient, console_mail: list
) -> None:
    posting_id = _setup_posting(client)
    application = _apply(client, posting_id)

    response = client.post(
        f"/api/v1/applications/{application['id']}/decision",
        headers=ADMIN,
        json={"decision": "rejected", "message": "Strong pool this year."},
    )
    assert response.status_code == 200
    sent = console_mail[-1]
    assert sent.to_email == CANDIDATE_EMAIL
    assert "will not be moving forward" in sent.body
    assert "Strong pool this year." in sent.body


# --- email template admin endpoints -------------------------------------------


def test_email_template_admin_lifecycle(client: TestClient) -> None:
    _setup_posting(client)

    listing = client.get("/api/v1/organizations/current/email-templates", headers=ADMIN)
    assert listing.status_code == 200
    templates = listing.json()["templates"]
    assert {t["template_key"] for t in templates} == {
        "stage_update",
        "acceptance",
        "rejection",
    }
    assert all(t["is_custom"] is False for t in templates)
    assert "{candidate_name}" in listing.json()["placeholders"]

    saved = client.put(
        "/api/v1/organizations/current/email-templates/rejection",
        headers=ADMIN,
        json={"subject": "Decision on {job_title}", "body": "Hello {candidate_name}, no."},
    )
    assert saved.status_code == 200

    reread = client.get("/api/v1/organizations/current/email-templates", headers=ADMIN).json()[
        "templates"
    ]
    rejection = next(t for t in reread if t["template_key"] == "rejection")
    assert rejection["is_custom"] is True
    assert rejection["subject"] == "Decision on {job_title}"
    assert rejection["default_subject"] != rejection["subject"]

    unknown = client.put(
        "/api/v1/organizations/current/email-templates/nope",
        headers=ADMIN,
        json={"subject": "Hello", "body": "Hello there."},
    )
    assert unknown.status_code == 404

    reset = client.delete(
        "/api/v1/organizations/current/email-templates/rejection", headers=ADMIN
    )
    assert reset.status_code == 200
    assert reset.json()["template"]["is_custom"] is False

    reread = client.get("/api/v1/organizations/current/email-templates", headers=ADMIN).json()[
        "templates"
    ]
    rejection = next(t for t in reread if t["template_key"] == "rejection")
    assert rejection["is_custom"] is False

    # Candidates cannot reach the admin endpoints.
    denied = client.get("/api/v1/organizations/current/email-templates", headers=CANDIDATE)
    assert denied.status_code == 403
