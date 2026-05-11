# Connect Any REST API to AI Agents via OpenAPI Import

**License:** [Apache-2.0](../../LICENSE)

Most teams already have REST APIs with an OpenAPI spec. PlanVault can import those specs directly via the Admin API and expose each operation as a typed tool that the AI planner can call during session execution — no custom SDK or wrapper code required.

## Problem

Integrating an existing REST API with an AI agent usually means writing a custom tool wrapper, handling auth, mapping error codes, and keeping the schema in sync as the API evolves. PlanVault's OpenAPI import does all of this from the spec: it parses operations, generates input/output schemas, and stores them in the org tool catalog where they are versioned and auditable.

## Quick start

### 1. Register the tool from the OpenAPI spec

```bash
export PLANVAULT_BASE_URL=https://api.planvault.ai
export ADMIN_BEARER=<your-admin-token>
export ORG_ID=<your-org-uuid>

curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/tools" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "name": "task-api",
  "displayName": "Task Management API",
  "baseUrl": "https://api.example.com/v1",
  "openApiSpec": {
    "openapi": "3.0.3",
    "info": { "title": "Task Management API", "version": "1.0.0" },
    "paths": {
      "/tasks": {
        "get": {
          "operationId": "listTasks",
          "summary": "List tasks",
          "parameters": [{
            "name": "status", "in": "query",
            "schema": { "type": "string", "enum": ["open", "in_progress", "done"] }
          }],
          "responses": { "200": { "description": "Task list" } }
        }
      },
      "/tasks/{id}": {
        "patch": {
          "operationId": "updateTaskStatus",
          "summary": "Update task status",
          "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }],
          "requestBody": {
            "required": true,
            "content": { "application/json": { "schema": {
              "type": "object",
              "properties": { "status": { "type": "string", "enum": ["open", "in_progress", "done"] } },
              "required": ["status"]
            }}}
          },
          "responses": { "200": { "description": "Updated task" } }
        }
      }
    }
  }
}
EOF
```

The response contains a `toolId`. Note it — you'll use it to enable the tool for a project.

### 2. Enable the tool for a project

```bash
export PROJECT_ID=<your-project-uuid>

curl -s -X PUT "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/tools/integrations/task-api" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 3. Store the API key as a session secret (optional)

If the target API requires authentication, store the credential as a session secret so it is injected at execution time without entering the prompt:

```bash
# When creating a session:
curl -s -X POST "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/sessions" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contextVars": {},
    "secrets": { "TASK_API_KEY": "Bearer sk-live-your-real-key" }
  }'
```

Reference `{{secrets.TASK_API_KEY}}` in the tool's auth header template in the Admin UI — PlanVault binds it after planning, never inside a prompt.

## Sample OpenAPI spec

[`openapi-sample.yaml`](openapi-sample.yaml) is the same task management API in YAML format. Pass it as `--data-binary @openapi-sample.yaml` with `Content-Type: application/yaml` if your Admin API version supports YAML upload, or convert to JSON inline.

## How it works

1. PlanVault parses the OpenAPI spec and creates one tool entry per operation (`operationId` → tool name).
2. The planner sees tool descriptions derived from `summary` and `description` fields — write these clearly to improve planning accuracy.
3. At execution time PlanVault makes the actual HTTP call, injects secrets, handles retries, and stores the tool result in the run event log.
4. If the call fails, the evidence-replan mechanism can surface the error to the planner for an alternative approach — no manual retry code needed.

## Links

- [API reference](https://planvault.ai/api-docs) — Admin tool endpoints and OpenAPI import schema
- [Product guide](https://planvault.ai/docs) — tool catalog and integration setup
- [Security](https://planvault.ai/security) — secret injection and BYOK encryption details
