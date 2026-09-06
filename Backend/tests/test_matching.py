"""MATCH-01: posting publish triggers consent-safe proactive matching."""

from fastapi.testclient import TestClient

ADMIN = {"X-Development-Identity": "match-admin"}
CANDIDATE = {"X-Development-Identity": "match-candidate"}


def _setup_published_posting(client: TestClient) -> str:
    client.post(
        "/api/v1/organizations",
        headers=ADMIN,
        json={"name": "Match Co", "idempotency_key": "match-org"},
    )
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
            "description": "API design, system design, testing, and observability.",
            "pack_id": "software-engineering",
            "idempotency_key": "match-post",
        },
    ).json()["posting"]
    client.post(f"/api/v1/postings/{posting['id']}/question-pool/generate", headers=ADMIN)
    client.post(f"/api/v1/postings/{posting['id']}/question-pool/lock", headers=ADMIN)
    return posting["id"]


def test_publish_generates_matches_for_consenting_candidates(client: TestClient) -> None:
    posting_id = _setup_published_posting(client)

    # Candidate prepares a discoverable profile with overlapping skills.
    client.patch(
        "/api/v1/candidates/me/profile",
        headers=CANDIDATE,
        json={
            "headline": "Backend engineer",
            "skills": ["API design", "system design", "testing", "observability"],
            "target_domains": ["software-engineering"],
        },
    )
    client.put(
        "/api/v1/candidates/me/consents/discovery",
        headers=CANDIDATE,
        json={"granted": True},
    )
    attempt = client.post(
        "/api/v1/candidates/me/profile-interview-attempts",
        headers=CANDIDATE,
        json={"pack_id": "software-engineering"},
    ).json()["attempt"]
    responses = {
        question["id"]: (
            "I would focus on API design and system design early, because API design and "
            "system design shape reliability. I would also use testing and observability "
            "to validate the rollout and communicate risk clearly."
        )
        for question in attempt["questions"]
    }
    client.patch(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/responses",
        headers=CANDIDATE,
        json={"responses": responses},
    )
    client.post(
        f"/api/v1/profile-interview-attempts/{attempt['id']}/submit",
        headers=CANDIDATE,
        json={"idempotency_key": "match-pi"},
    )

    published = client.post(f"/api/v1/postings/{posting_id}/publish", headers=ADMIN)
    assert published.status_code == 200
    assert published.json()["matches"]["count"] >= 1

    employer_matches = client.get(
        f"/api/v1/postings/{posting_id}/matches", headers=ADMIN
    )
    assert employer_matches.status_code == 200
    body = employer_matches.json()
    assert body["count"] >= 1
    assert body["matches"][0]["score"] >= 45
    assert body["matches"][0]["reasons"]

    candidate_matches = client.get("/api/v1/candidates/me/matches", headers=CANDIDATE)
    assert candidate_matches.status_code == 200
    assert candidate_matches.json()["count"] >= 1
    assert candidate_matches.json()["matches"][0]["posting_id"] == posting_id

    notifications = client.get("/api/v1/notifications", headers=CANDIDATE)
    assert notifications.status_code == 200
    titles = [item["title"] for item in notifications.json()["notifications"]]
    assert any("match" in title.lower() or "role" in title.lower() for title in titles)
