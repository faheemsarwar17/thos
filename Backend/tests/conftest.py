from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Environment, Settings
from app.db.database import reset_schema_cache
from app.main import create_app

PACKS_PATH = str(Path(__file__).resolve().parents[2] / "domain-packs")


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    reset_schema_cache()
    return Settings.model_validate(
        {
            "environment": Environment.TEST,
            "cors_origins": "http://testserver",
            "development_identity": "test-identity",
            # Force SQLite for isolated unit tests even when .env points at Postgres.
            "database_url": None,
            "database_path": str(tmp_path / "test.db"),
            "avatars_dir": str(tmp_path / "avatars"),
            "videos_dir": str(tmp_path / "videos"),
            # Never touch real SMTP from tests; mail lands in the console adapter.
            "smtp_host": None,
            "smtp_user": None,
            "smtp_password": None,
            "domain_packs_path": PACKS_PATH,
            "seed_demo_data": False,
            "superadmin_emails": "superadmin@thos.local",
            "jwt_secret": "test-jwt-secret-key-at-least-32b!",
            "livekit_url": None,
            "livekit_api_key": None,
            "livekit_api_secret": None,
            "ai_api_key": None,
        }
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def as_identity(identity: str) -> dict[str, str]:
    return {"X-Development-Identity": identity}
