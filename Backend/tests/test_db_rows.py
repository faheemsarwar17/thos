"""Postgres rows must support the same access patterns as sqlite3.Row."""

from app.db.database import PostgresRow


def test_postgres_row_supports_key_index_and_dict_access() -> None:
    row = PostgresRow(("id", "count"), ("app_1", 3))

    assert row["id"] == "app_1"
    assert row[0] == "app_1"
    assert row[1] == 3
    assert row[-1] == 3
    assert dict(row) == {"id": "app_1", "count": 3}
    assert list(row.keys()) == ["id", "count"]
    assert row.get("missing") is None
