"""CV parse + embedding matching."""

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.services.cv_parse import parse_cv_heuristic
from app.services.embeddings import cosine_similarity, embed_text

ADMIN = {"X-Development-Identity": "cv-admin"}
CANDIDATE = {"X-Development-Identity": "cv-candidate"}

SAMPLE_CV = """
Jane Doe
Senior Backend Engineer

Summary
API design and system design specialist with strong testing habits.

Skills
API design, system design, testing, observability, Python, FastAPI

Experience
Built hiring platforms with FastAPI and Postgres.
Owned observability rollouts across distributed services.

Education
BSc Computer Science
"""


def test_heuristic_cv_parse_shapes_sections() -> None:
    parsed = parse_cv_heuristic(SAMPLE_CV, source_filename="jane.txt")
    titles = {section.title.lower() for section in parsed.sections}
    assert "skills" in titles or "summary" in titles
    assert parsed.parser == "heuristic"
    assert any(section.content for section in parsed.sections)


def test_local_embeddings_are_comparable() -> None:
    # No provider key: embeddings fall back to the deterministic local model.
    settings = Settings(environment="test", seed_demo_data=False, ai_api_key=None)
    left, model = embed_text("API design system design testing observability", settings=settings)
    right, _ = embed_text(
        "Backend Engineer needing API design, system design, testing, observability",
        settings=settings,
    )
    assert model.startswith("local")
    assert cosine_similarity(left, right) > 0.2


def test_parse_endpoint_stores_cv_and_embedding(client: TestClient) -> None:
    response = client.post(
        "/api/v1/candidates/me/cv/parse",
        headers=CANDIDATE,
        json={"text": SAMPLE_CV, "source_filename": "jane.txt", "apply_to_profile": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["parsed_cv"]["sections"]
    assert body["candidate"]["has_embedding"] is True
    assert body["candidate"]["profile"]["skills"]
    assert body["embedding"]["has_embedding"] is True


def _setup_published_posting(client: TestClient) -> str:
    client.post(
        "/api/v1/organizations",
        headers=ADMIN,
        json={"name": "Vector Co", "idempotency_key": "vector-org"},
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
            "idempotency_key": "vector-post",
        },
    ).json()["posting"]
    client.post(f"/api/v1/postings/{posting['id']}/question-pool/generate", headers=ADMIN)
    client.post(f"/api/v1/postings/{posting['id']}/question-pool/lock", headers=ADMIN)
    return posting["id"]


def test_publish_uses_embedding_similarity(client: TestClient) -> None:
    posting_id = _setup_published_posting(client)
    client.post(
        "/api/v1/candidates/me/cv/parse",
        headers=CANDIDATE,
        json={"text": SAMPLE_CV, "apply_to_profile": True},
    )
    client.put(
        "/api/v1/candidates/me/consents/discovery",
        headers=CANDIDATE,
        json={"granted": True},
    )
    client.patch(
        "/api/v1/candidates/me/profile",
        headers=CANDIDATE,
        json={"target_domains": ["software-engineering"]},
    )

    published = client.post(f"/api/v1/postings/{posting_id}/publish", headers=ADMIN)
    assert published.status_code == 200
    assert published.json()["matches"]["count"] >= 1

    matches = client.get(f"/api/v1/postings/{posting_id}/matches", headers=ADMIN).json()
    assert matches["count"] >= 1
    reasons = " ".join(matches["matches"][0]["reasons"]).lower()
    assert "embedding" in reasons or "skill" in reasons
