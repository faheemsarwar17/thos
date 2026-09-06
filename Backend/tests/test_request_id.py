from uuid import UUID

from fastapi.testclient import TestClient


def test_valid_request_and_correlation_ids_are_propagated(client: TestClient) -> None:
    request_id = "7b3577e5-df32-4c37-94de-ec765a5215f0"
    correlation_id = "ea92d67e-d1fd-4452-90fe-401bba3fd7f6"

    response = client.get(
        "/health/live",
        headers={"X-Request-ID": request_id, "X-Correlation-ID": correlation_id},
    )

    assert response.headers["X-Request-ID"] == request_id
    assert response.headers["X-Correlation-ID"] == correlation_id


def test_free_text_request_id_is_replaced_with_opaque_uuid(client: TestClient) -> None:
    response = client.get("/health/live", headers={"X-Request-ID": "candidate@example.com"})

    generated_id = response.headers["X-Request-ID"]
    assert str(UUID(generated_id)) == generated_id
    assert response.headers["X-Correlation-ID"] == generated_id
