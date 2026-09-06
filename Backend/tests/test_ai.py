from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import Environment, Settings
from app.main import create_app


def test_question_generation_has_deterministic_disabled_fallback(client: TestClient) -> None:
    response = client.post(
        "/api/v1/ai/interview-questions",
        json={
            "domain_context": "Use the active domain pack's supplied interview context.",
            "competencies": ["analysis", "communication"],
            "question_count": 2,
            "pack_version": "pack-v1",
            "rubric_version": "rubric-v1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "disabled"
    assert body["questions"] == []
    assert body["requires_human_review"] is True
    assert body["metadata"]["pack_version"] == "pack-v1"
    assert body["metadata"]["rubric_version"] == "rubric-v1"


def test_question_generation_requires_trusted_identity_in_production(tmp_path: Path) -> None:
    settings = Settings.model_validate(
        {
            "environment": Environment.PRODUCTION,
            "cors_origins": "https://app.example.test",
            "ai_api_key": "configured-provider-key",
            # Isolate from the developer .env (real database / SMTP).
            "database_url": None,
            "database_path": str(tmp_path / "ai_prod.db"),
            "seed_demo_data": False,
        }
    )
    with TestClient(create_app(settings)) as client:
        response = client.post(
            "/api/v1/ai/interview-questions",
            json={
                "domain_context": "Education Pack context",
                "competencies": ["teaching"],
                "question_count": 1,
                "pack_version": "education-v1",
                "rubric_version": "rubric-v1",
            },
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "authentication_required"
