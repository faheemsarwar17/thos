"""Proctoring columns, store helpers and the posting toggle (Task 1)."""

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db import store
from app.db.database import connect
from tests.proctoring_helpers import (
    ADMIN,
    applied_attempt,
    create_org_and_workflow,
    create_posting,
    profile_attempt,
)


def test_migration_adds_proctoring_columns(client: TestClient, settings: Settings) -> None:
    conn = connect(settings.database)
    try:
        conn.execute("SELECT proctoring FROM profile_interview_attempts LIMIT 0")
        conn.execute("SELECT proctoring FROM applied_interview_attempts LIMIT 0")
        conn.execute("SELECT proctoring_enabled FROM postings LIMIT 0")
    finally:
        conn.close()


def test_proctoring_record_round_trips_for_both_kinds(
    client: TestClient, settings: Settings
) -> None:
    _, applied_id = applied_attempt(client)
    profile_id = profile_attempt(client)
    conn = connect(settings.database)
    try:
        for kind, attempt_id in (("applied", applied_id), ("profile", profile_id)):
            assert store.get_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id) is None
            record = {
                "version": 1,
                "enabled": True,
                "events": [{"id": "pev_1", "type": "tab_hidden"}],
            }
            store.set_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id, record=record)
            conn.commit()
            assert store.get_attempt_proctoring(conn, kind=kind, attempt_id=attempt_id) == record
        assert (
            store.get_applied_attempt_by_id(conn, attempt_id=applied_id)["proctoring"]["enabled"]
            is True
        )
        store.lock_attempt_row(conn, kind="applied", attempt_id=applied_id)
        conn.rollback()
    finally:
        conn.close()


def test_posting_proctoring_defaults_on_and_can_be_disabled(client: TestClient) -> None:
    create_org_and_workflow(client)
    posting = create_posting(client, "proc-toggle")
    assert posting["proctoring_enabled"] is True
    fetched = client.get(f"/api/v1/postings/{posting['id']}", headers=ADMIN).json()["posting"]
    assert fetched["proctoring_enabled"] is True

    patched = client.patch(
        f"/api/v1/postings/{posting['id']}", headers=ADMIN, json={"proctoring_enabled": False}
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["posting"]["proctoring_enabled"] is False
    fetched = client.get(f"/api/v1/postings/{posting['id']}", headers=ADMIN).json()["posting"]
    assert fetched["proctoring_enabled"] is False

    off = create_posting(client, "proc-toggle-off", proctoring_enabled=False)
    assert off["proctoring_enabled"] is False
