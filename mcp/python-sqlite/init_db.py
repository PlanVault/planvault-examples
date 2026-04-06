# SPDX-License-Identifier: Apache-2.0
"""Create database.sqlite with a demo users table (idempotent)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = HERE / "database.sqlite"


def main() -> None:
    conn = sqlite3.connect(DB)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, name) VALUES (1, 'alice@example.com', 'Alice')"
        )
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, name) VALUES (2, 'bob@example.com', 'Bob')"
        )
        conn.commit()
    finally:
        conn.close()
    print(f"OK: {DB}")


if __name__ == "__main__":
    main()
