"""Persistence for the THOS backend: PostgreSQL or SQLite.

Set ``THOS_DATABASE_URL`` (``postgresql://user:pass@host:5432/thos``) to use
PostgreSQL; otherwise the SQLite file at ``THOS_DATABASE_PATH`` is used so
local development and tests stay dependency-free. Every table is
tenant-scoped and all access goes through tenant-aware helpers, so the two
engines share one query surface: ``?`` placeholders are translated for
PostgreSQL by a thin connection adapter.
"""

import json
import sqlite3
import threading
from collections.abc import Iterator, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    identity TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    email_verified_at TEXT,
    is_superadmin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    replaced_by TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    org_type TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    legal_name TEXT NOT NULL DEFAULT '',
    trading_name TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    registration_number TEXT NOT NULL DEFAULT '',
    pending_owner_user_id TEXT,
    verified_at TEXT,
    verified_by_user_id TEXT,
    rejection_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_invitations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    invited_by_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    temp_password_hash TEXT,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON organization_invitations (tenant_id);

CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    parent_unit_id TEXT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units (tenant_id);

CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    unit_scope_ids TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id);

CREATE TABLE IF NOT EXISTS domain_pack_activations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL,
    manifest TEXT NOT NULL,
    activated_by TEXT NOT NULL,
    activated_at TEXT NOT NULL,
    UNIQUE (tenant_id, pack_id)
);

CREATE TABLE IF NOT EXISTS tenant_domain_packs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL,
    manifest TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, pack_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_packs ON tenant_domain_packs (tenant_id);

CREATE TABLE IF NOT EXISTS workflow_versions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    template_name TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    stages TEXT NOT NULL,
    candidate_status_mapping TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_workflow_tenant ON workflow_versions (tenant_id);

CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    profile TEXT NOT NULL,
    consents TEXT NOT NULL DEFAULT '{}',
    target_domains TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_interview_attempts (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    pack_version TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress',
    questions TEXT NOT NULL,
    responses TEXT NOT NULL DEFAULT '{}',
    evaluation TEXT,
    started_at TEXT NOT NULL,
    submitted_at TEXT,
    transcripts TEXT NOT NULL DEFAULT '[]',
    room_name TEXT,
    started_via TEXT NOT NULL DEFAULT 'voice',
    duration_minutes INTEGER NOT NULL DEFAULT 10
);
CREATE INDEX IF NOT EXISTS idx_pia_candidate ON profile_interview_attempts (candidate_id);

CREATE TABLE IF NOT EXISTS postings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    unit_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    work_mode TEXT NOT NULL DEFAULT 'hybrid',
    employment_type TEXT NOT NULL DEFAULT 'full_time',
    status TEXT NOT NULL DEFAULT 'draft',
    pack_id TEXT,
    pack_version TEXT,
    workflow_version_id TEXT,
    workflow_snapshot TEXT,
    question_pool TEXT,
    pool_status TEXT NOT NULL DEFAULT 'not_generated',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT,
    closed_at TEXT,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_postings_tenant ON postings (tenant_id);

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    posting_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    stage_id TEXT NOT NULL,
    stage_category TEXT NOT NULL,
    stage_version INTEGER NOT NULL DEFAULT 1,
    profile_snapshot TEXT NOT NULL,
    profile_interview_score REAL,
    job_match_score REAL,
    job_match_reasons TEXT,
    answers TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (posting_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate ON applications (candidate_id);

CREATE TABLE IF NOT EXISTS application_transitions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    from_stage_id TEXT NOT NULL,
    to_stage_id TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    actor_user_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transitions_application
    ON application_transitions (application_id);

CREATE TABLE IF NOT EXISTS applied_interview_attempts (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    application_id TEXT NOT NULL UNIQUE,
    candidate_id TEXT NOT NULL,
    posting_id TEXT NOT NULL,
    pool_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'invited',
    questions TEXT NOT NULL,
    responses TEXT NOT NULL DEFAULT '{}',
    evaluation TEXT,
    invited_at TEXT NOT NULL,
    started_at TEXT,
    submitted_at TEXT,
    transcripts TEXT NOT NULL DEFAULT '[]',
    room_name TEXT,
    started_via TEXT NOT NULL DEFAULT 'voice',
    duration_minutes INTEGER NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS reviewer_scorecards (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    reviewer_user_id TEXT NOT NULL,
    scores TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (application_id, reviewer_user_id)
);

CREATE TABLE IF NOT EXISTS audit_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    old_state TEXT,
    new_state TEXT,
    reason TEXT NOT NULL DEFAULT '',
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_records (tenant_id);

CREATE TABLE IF NOT EXISTS idempotency_records (
    key TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    response_body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (key, tenant_id, operation)
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    tenant_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    recipient_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications (recipient_user_id);

CREATE TABLE IF NOT EXISTS posting_matches (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    posting_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    score REAL NOT NULL,
    skill_score REAL NOT NULL DEFAULT 0,
    interview_score REAL NOT NULL DEFAULT 0,
    reasons TEXT NOT NULL DEFAULT '[]',
    notified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (posting_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_posting ON posting_matches (posting_id);
CREATE INDEX IF NOT EXISTS idx_matches_candidate ON posting_matches (candidate_id);

CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    template_key TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates (tenant_id);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    application_id TEXT,
    posting_id TEXT,
    candidate_id TEXT NOT NULL,
    subject TEXT NOT NULL DEFAULT '',
    last_message_preview TEXT NOT NULL DEFAULT '',
    last_message_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_candidate ON conversations (candidate_id);
CREATE INDEX IF NOT EXISTS idx_conversations_app ON conversations (application_id);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    sender_name TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    read_by_recipient INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON conversation_messages (conversation_id, sent_at);

CREATE TABLE IF NOT EXISTS automation_rules (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    trigger_event TEXT NOT NULL,
    trigger_config TEXT NOT NULL DEFAULT '{}',
    conditions TEXT NOT NULL DEFAULT '[]',
    actions TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automations_tenant ON automation_rules (tenant_id);

CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    trigger_resource_id TEXT NOT NULL,
    status TEXT NOT NULL,
    execution_log TEXT NOT NULL DEFAULT '',
    error_message TEXT,
    executed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auto_runs_rule ON automation_runs (rule_id);
"""

_lock = threading.Lock()
_initialized_databases: set[str] = set()


class Cursor(Protocol):
    """The cursor surface the store layer relies on."""

    rowcount: int

    def fetchone(self) -> Any: ...
    def fetchall(self) -> list[Any]: ...


class Connection(Protocol):
    """The connection surface the store layer relies on."""

    def execute(self, sql: str, params: Sequence[Any] = ...) -> Cursor: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def close(self) -> None: ...


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def from_json(value: str | None, default: Any = None) -> Any:
    if value is None:
        return default
    return json.loads(value)


def is_postgres(database: str) -> bool:
    return database.startswith(("postgres://", "postgresql://"))


class PostgresConnection:
    """Adapts psycopg to the sqlite3-style surface used by the store layer.

    The store layer writes engine-neutral SQL with ``?`` placeholders;
    this adapter translates them to psycopg's ``%s`` style and returns
    dict rows, so ``row["column"]`` and ``dict(row)`` behave identically
    across both engines.
    """

    def __init__(self, raw: Any) -> None:
        self._raw = raw

    def execute(self, sql: str, params: Sequence[Any] = ()) -> Any:
        return self._raw.execute(sql.replace("?", "%s"), tuple(params))

    def commit(self) -> None:
        self._raw.commit()

    def rollback(self) -> None:
        self._raw.rollback()

    def close(self) -> None:
        self._raw.close()


_AUTH_COLUMN_MIGRATIONS: list[tuple[str, str, str]] = [
    # (table, column, sql_type_with_default)
    ("users", "password_hash", "TEXT"),
    ("users", "status", "TEXT NOT NULL DEFAULT 'active'"),
    ("users", "email_verified_at", "TEXT"),
    ("users", "is_superadmin", "INTEGER NOT NULL DEFAULT 0"),
    ("organizations", "legal_name", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "trading_name", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "domain", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "contact_email", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "contact_phone", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "address", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "registration_number", "TEXT NOT NULL DEFAULT ''"),
    ("organizations", "pending_owner_user_id", "TEXT"),
    ("organizations", "verified_at", "TEXT"),
    ("organizations", "verified_by_user_id", "TEXT"),
    ("organizations", "rejection_reason", "TEXT NOT NULL DEFAULT ''"),
    # CV parse + embedding (JSON float arrays; portable across SQLite/Postgres)
    ("candidates", "parsed_cv", "TEXT"),
    ("candidates", "embedding", "TEXT"),
    ("candidates", "embedding_model", "TEXT"),
    ("candidates", "embedded_at", "TEXT"),
    ("postings", "embedding", "TEXT"),
    ("postings", "embedding_model", "TEXT"),
    ("postings", "embedded_at", "TEXT"),
    # Voice interview fields (PTS port)
    ("profile_interview_attempts", "transcripts", "TEXT NOT NULL DEFAULT '[]'"),
    ("profile_interview_attempts", "room_name", "TEXT"),
    ("profile_interview_attempts", "started_via", "TEXT NOT NULL DEFAULT 'voice'"),
    ("profile_interview_attempts", "duration_minutes", "INTEGER NOT NULL DEFAULT 10"),
    ("applied_interview_attempts", "transcripts", "TEXT NOT NULL DEFAULT '[]'"),
    ("applied_interview_attempts", "room_name", "TEXT"),
    ("applied_interview_attempts", "started_via", "TEXT NOT NULL DEFAULT 'voice'"),
    ("applied_interview_attempts", "duration_minutes", "INTEGER NOT NULL DEFAULT 10"),
    # Profile photos (PFP) and live identity verification
    ("users", "avatar_path", "TEXT"),
    ("profile_interview_attempts", "identity_verification", "TEXT"),
    ("applied_interview_attempts", "identity_verification", "TEXT"),
    # LangGraph interview pipeline: pre-generated plan + per-answer assessments
    ("profile_interview_attempts", "interview_plan", "TEXT"),
    ("profile_interview_attempts", "answer_assessments", "TEXT"),
    ("applied_interview_attempts", "interview_plan", "TEXT"),
    ("applied_interview_attempts", "answer_assessments", "TEXT"),
    # Proctored sandbox assessment (posting config + per-attempt session)
    ("postings", "sandbox_required", "INTEGER NOT NULL DEFAULT 0"),
    ("postings", "sandbox_config", "TEXT"),
    ("applied_interview_attempts", "sandbox_session", "TEXT"),
    # AI candidate feedback & loophole analysis for rejections
    ("applications", "ai_improvement_feedback", "TEXT"),
    # Workplace work mode (remote, hybrid, onsite)
    ("postings", "work_mode", "TEXT NOT NULL DEFAULT 'hybrid'"),
]


def _column_exists(connection: Connection, table: str, column: str) -> bool:
    try:
        connection.execute(f"SELECT {column} FROM {table} LIMIT 0")
        return True
    except Exception:
        connection.rollback()
        return False


def _apply_auth_migrations(connection: Connection) -> None:
    for table, column, definition in _AUTH_COLUMN_MIGRATIONS:
        if not _column_exists(connection, table, column):
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _enable_pgvector(connection: Connection) -> None:
    """Best-effort pgvector setup for Postgres ANN (optional at pilot scale)."""
    try:
        connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
    except Exception:
        connection.rollback()


def _apply_schema(connection: Connection) -> None:
    """Apply DDL one statement at a time (required by psycopg)."""
    for statement in _SCHEMA.split(";"):
        sql = statement.strip()
        if sql:
            try:
                connection.execute(sql)
                connection.commit()
            except Exception:
                connection.rollback()
    _apply_auth_migrations(connection)


def _apply_schema_postgres(connection: Connection) -> None:
    _enable_pgvector(connection)
    _apply_schema(connection)


def _connect_postgres(database_url: str) -> PostgresConnection:
    import psycopg
    from psycopg.rows import dict_row

    raw = psycopg.connect(database_url, row_factory=dict_row)
    connection = PostgresConnection(raw)
    with _lock:
        if database_url not in _initialized_databases:
            _apply_schema_postgres(connection)
            connection.commit()
            _initialized_databases.add(database_url)
    return connection


def _connect_sqlite(database_path: str) -> sqlite3.Connection:
    if database_path != ":memory:":
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    # Each request gets its own connection; FastAPI may create it in a
    # threadpool thread and use it from the event loop thread.
    connection = sqlite3.connect(database_path, timeout=30, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    with _lock:
        if database_path not in _initialized_databases:
            connection.executescript(_SCHEMA)
            _apply_auth_migrations(connection)
            connection.commit()
            _initialized_databases.add(database_path)
    return connection


def connect(database: str) -> Connection:
    """Open a connection to ``database``.

    Accepts either a PostgreSQL URL (``postgresql://...``) or a SQLite
    file path.
    """
    if is_postgres(database):
        return _connect_postgres(database)
    return _connect_sqlite(database)


def reset_schema_cache() -> None:
    with _lock:
        _initialized_databases.clear()


def rows_to_dicts(rows: Iterator[Any]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]
