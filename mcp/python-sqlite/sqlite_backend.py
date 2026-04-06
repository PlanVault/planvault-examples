# SPDX-License-Identifier: Apache-2.0
"""Read-only SQLite access for MCP tools (separated for testing)."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

_DEFAULT_DB = Path(__file__).resolve().parent / "database.sqlite"


def database_path() -> Path:
    """Return DB path; override with env ``PLANVAULT_SQLITE_PATH`` for tests."""
    override = os.environ.get("PLANVAULT_SQLITE_PATH", "").strip()
    return Path(override) if override else _DEFAULT_DB


def connect_readonly(path: Path | None = None) -> sqlite3.Connection:
    p = path or database_path()
    if not p.is_file():
        raise FileNotFoundError(f"Missing database file: {p}; run: python init_db.py")
    conn = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def rows_to_json(rows: list[sqlite3.Row]) -> str:
    return json.dumps([dict(r) for r in rows], ensure_ascii=False)


def pragma_users_schema(conn: sqlite3.Connection) -> str:
    cur = conn.execute("PRAGMA table_info(users)")
    return rows_to_json(cur.fetchall())


def select_user_by_email(conn: sqlite3.Connection, email: str) -> str:
    cur = conn.execute("SELECT * FROM users WHERE email = ?", (email.strip(),))
    return rows_to_json(cur.fetchall())
