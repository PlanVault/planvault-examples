# MCP SQLite demo (Python, stdio)

**License:** [Apache-2.0](../../LICENSE) (this `planvault-examples` tree).

Read-only tools over a local `database.sqlite` file.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python init_db.py
```

Run the server (stdio):

```bash
python main.py
```

## Register in PlanVault (Admin API)

1. Create the server (replace `ADMIN_BEARER`, org id, and absolute paths):

```bash
curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/mcp/servers" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sqlite-demo",
    "transport": "stdio",
    "command": "python",
    "args": ["/ABS/PATH/TO/planvault-examples/mcp/python-sqlite/main.py"],
    "env": {},
    "enabled": true,
    "syncEnabled": true
  }'
```

The Admin API has **no working-directory field**; use an absolute path in `args` (or a wrapper script).

2. Import tool definitions into the org catalog:

```bash
curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/mcp/servers/$SERVER_ID/sync" \
  -H "Authorization: Bearer $ADMIN_BEARER"
```

## Tools

| Tool | Behavior |
|------|----------|
| `query_users` | `PRAGMA table_info(users)` as JSON text |
| `get_user_by_email` | Parameter `email`; `SELECT * FROM users WHERE email = ?` |

## Screenshots

_Add UI screenshots here when documenting in your docs site._
