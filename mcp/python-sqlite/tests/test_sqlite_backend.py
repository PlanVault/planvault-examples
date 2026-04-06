# SPDX-License-Identifier: Apache-2.0
"""Tests for read-only SQLite helpers."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from sqlite_backend import connect_readonly, pragma_users_schema, rows_to_json, select_user_by_email


def test_rows_to_json_empty() -> None:
    assert rows_to_json([]) == "[]"


def test_pragma_and_select(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = tmp_path / "t.sqlite"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL)")
    conn.execute("INSERT INTO users (email, name) VALUES (?, ?)", ("a@x.test", "A"))
    conn.commit()
    conn.close()

    monkeypatch.setenv("PLANVAULT_SQLITE_PATH", str(db))

    with connect_readonly() as c:
        schema = pragma_users_schema(c)
        assert "email" in schema
        row = select_user_by_email(c, "a@x.test")
        assert "a@x.test" in row
