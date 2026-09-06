from fastapi.testclient import TestClient

from app.core.config import Environment, Settings
from app.main import create_app


def test_livekit_token_fails_safely_when_credentials_are_missing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/interviews/token",
        json={"room_name": "interview-room"},
    )

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "integration_not_configured"
    assert body["error"]["message"] == "LiveKit is not configured for this environment."
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    assert body["error"]["details"] == []


def test_production_rejects_caller_chosen_interview_identity() -> None:
    settings = Settings(
        _env_file=None,
        environment=Environment.PRODUCTION,
        cors_origins="https://app.example.com",
    )

    with TestClient(create_app(settings)) as client:
        response = client.post(
            "/api/v1/interviews/token",
            headers={"X-Development-Identity": "caller-selected"},
            json={"room_name": "interview-room"},
        )

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "authentication_required"
