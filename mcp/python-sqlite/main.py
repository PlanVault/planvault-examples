# SPDX-License-Identifier: Apache-2.0
"""Read-only MCP server over SQLite (stdio) using FastMCP."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from sqlite_backend import connect_readonly, pragma_users_schema, select_user_by_email

mcp = FastMCP("planvault-sqlite-demo")


@mcp.tool()
def query_users() -> str:
    """Return PRAGMA table_info for the users table (read-only)."""
    with connect_readonly() as conn:
        return pragma_users_schema(conn)


@mcp.tool()
def get_user_by_email(email: str) -> str:
    """SELECT * FROM users WHERE email = ? (read-only)."""
    with connect_readonly() as conn:
        return select_user_by_email(conn, email)


if __name__ == "__main__":
    mcp.run()
