"""Optional live-Postgres smoke; skips when THOS_DATABASE_URL is unreachable."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import Environment, Settings
from app.db.database import is_postgres, reset_schema_cache
from app.main import create_app

POSTGRES_URL = os.environ.get(
    "THOS_DATABASE_URL",
    "postgresql://thos:thos@localhost:5432/thos",
)


def _postgres_reachable() -> bool:
    if not is_postgres(POSTGRES_URL):
        return False
    try:
        import psycopg

        with psycopg.connect(POSTGRES_URL, connect_timeout=2) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _postgres_reachable(),
    reason="PostgreSQL is not reachable at THOS_DATABASE_URL",
)


@pytest.fixture
def pg_client() -> TestClient:
    reset_schema_cache()
    settings = Settings.model_validate(
        {
            "environment": Environment.DEVELOPMENT,
            "cors_origins": "http://testserver",
            "development_identity": "local-developer",
            "database_url": POSTGRES_URL,
            "domain_packs_path": str(
                __import__("pathlib").Path(__file__).resolve().parents[2] / "domain-packs"
            ),
            "seed_demo_data": True,
        }
    )
    with TestClient(create_app(settings)) as client:
        yield client


def test_postgres_serves_seeded_employer_data(pg_client: TestClient) -> None:
    headers = {"X-Development-Identity": "local-developer"}
    me = pg_client.get("/api/v1/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["memberships"]

    postings = pg_client.get("/api/v1/postings", headers=headers)
    assert postings.status_code == 200
    assert len(postings.json()["postings"]) >= 1

    pipeline = pg_client.get("/api/v1/pipeline", headers=headers)
    assert pipeline.status_code == 200
    cards = [c for col in pipeline.json()["columns"] for c in col["cards"]]
    assert len(cards) >= 1
