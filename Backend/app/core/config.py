import os
from enum import StrEnum
from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="THOS_",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "THOS API"
    app_version: str = "0.1.0"
    environment: Environment = Environment.DEVELOPMENT
    debug: bool = False
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    request_id_header: str = "X-Request-ID"
    correlation_id_header: str = "X-Correlation-ID"

    development_identity: str = "local-developer"

    # PostgreSQL URL, e.g. postgresql://thos:thos@localhost:5432/thos.
    # When set it takes precedence over the SQLite file at database_path.
    database_url: str | None = None
    database_path: str = "./data/thos.db"
    seed_demo_data: bool = True
    domain_packs_path: str = "../domain-packs"

    # SMTP Configuration
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from_email: str = "noreply@thos.local"

    # Public URL of the candidate portal, used in outbound emails.
    public_base_url: str = "http://localhost:3000"
    # Local directory where user profile photos (PFP) are stored.
    avatars_dir: str = "./data/avatars"

    # S3 Storage Configuration
    s3_endpoint: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: SecretStr | None = None
    s3_bucket_name: str | None = None
    s3_region: str = "us-east-1"

    profile_interview_attempt_cap: int = 3
    profile_interview_cooldown_hours: int = 24

    jwt_secret: SecretStr = SecretStr("thos-dev-jwt-secret-change-me-now-32b")
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_ttl_seconds: int = 1_209_600
    # Comma-separated emails that receive platform superadmin on register/seed.
    superadmin_emails: str = "superadmin@thos.local"
    # When true in development, org applications are auto-verified.
    auto_verify_organizations: bool = False

    livekit_url: str | None = None
    livekit_api_key: str | None = None
    livekit_api_secret: SecretStr | None = None
    livekit_token_ttl_seconds: int = 900

    ai_provider: Literal["openai"] = "openai"
    ai_api_key: SecretStr | None = None
    ai_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"
    ai_timeout_seconds: int = 30

    # Voice interview pipeline: Silero VAD -> OpenAI STT -> LangGraph engine -> OpenAI TTS
    stt_model: str = "gpt-4o-mini-transcribe"
    tts_model: str = "gpt-4o-mini-tts"
    tts_voice: str = "sage"
    turn_assessment_model: str = "gpt-4o-mini"
    turn_assessment_max_tokens: int = 200
    endpointing_delay_seconds: float = 0.3
    vad_min_silence_seconds: float = 0.45
    # Answers shorter than this are treated as trivial/noise ("take your time" prompt).
    answer_max_words_followup_threshold: int = 12
    plan_generation_model: str = "gpt-4o"
    default_interview_language: str = "English"
    analysis_model: str = "gpt-4o"
    default_interview_length_minutes: int = 10
    recordings_dir: str = "./data/recordings"
    videos_dir: str = "./data/videos"
    voice_interview_enabled: bool = True

    @field_validator("livekit_url", "livekit_api_key", "database_url", mode="before")
    @classmethod
    def empty_string_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @property
    def database(self) -> str:
        """The active database target: PostgreSQL URL if set, else SQLite path."""
        return self.database_url or self.database_path

    @field_validator("livekit_token_ttl_seconds")
    @classmethod
    def validate_livekit_ttl(cls, value: int) -> int:
        if not 60 <= value <= 3600:
            raise ValueError("must be between 60 and 3600 seconds")
        return value

    @field_validator("ai_timeout_seconds")
    @classmethod
    def validate_ai_timeout(cls, value: int) -> int:
        if not 1 <= value <= 120:
            raise ValueError("must be between 1 and 120 seconds")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def ai_is_configured(self) -> bool:
        return self.ai_api_key is not None and bool(self.ai_api_key.get_secret_value())

    @property
    def openai_api_key(self) -> str:
        """PTS agent compatibility alias for the OpenAI API key."""
        if self.ai_api_key is None:
            return ""
        return self.ai_api_key.get_secret_value()

    @property
    def livekit_ws_url(self) -> str:
        """PTS agent compatibility alias for the LiveKit WebSocket URL."""
        return self.livekit_url or ""

    @property
    def livekit_is_configured(self) -> bool:
        return bool(
            self.livekit_url
            and self.livekit_api_key
            and self.livekit_api_secret is not None
            and self.livekit_api_secret.get_secret_value()
        )

    @property
    def voice_interview_ready(self) -> bool:
        return self.voice_interview_enabled and self.livekit_is_configured and self.ai_is_configured

    @property
    def superadmin_email_set(self) -> set[str]:
        return {
            email.strip().lower()
            for email in self.superadmin_emails.split(",")
            if email.strip()
        }

    @field_validator("jwt_access_ttl_seconds")
    @classmethod
    def validate_access_ttl(cls, value: int) -> int:
        if not 60 <= value <= 3600:
            raise ValueError("must be between 60 and 3600 seconds")
        return value

    @field_validator("jwt_refresh_ttl_seconds")
    @classmethod
    def validate_refresh_ttl(cls, value: int) -> int:
        if not 3600 <= value <= 7_776_000:
            raise ValueError("must be between 1 hour and 90 days")
        return value

    @model_validator(mode="after")
    def reject_wildcard_cors_outside_development(self) -> "Settings":
        if self.environment != Environment.DEVELOPMENT and "*" in self.cors_origin_list:
            raise ValueError("wildcard CORS is allowed only in development")
        return self

    @model_validator(mode="after")
    def sync_external_sdk_credentials(self) -> "Settings":
        if self.ai_api_key and self.ai_api_key.get_secret_value():
            os.environ.setdefault("OPENAI_API_KEY", self.ai_api_key.get_secret_value())
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


# PTS agent compatibility: `from app.core.config import settings`
settings = get_settings()
