# PlanVault Integration Examples: Connect AI Agents to Production APIs

[PlanVault](https://planvault.ai) is an AI agent execution runtime that adds fault-tolerant planning, BYOK secret injection, and human-in-the-loop approval gates to any AI agent stack without rewriting your existing tools or infrastructure.

## Why governed AI execution matters

- **Fault-tolerant, auditable runs** — every step is event-sourced; failed plans replay from the last committed state without re-running completed tool calls. Full run history is available via `GET .../history` for debugging and compliance audit.
- **Secrets never enter prompts** — API keys and credentials are stored encrypted and injected post-planning into tool call parameters as scoped references. The LLM sees a placeholder; the raw value is only bound at execution time.
- **Human-in-the-loop approval gates** — plans requiring sensitive actions (sending emails, writing to production databases, placing orders) can pause at a `confirm_plan_required` checkpoint until an operator approves or rejects via API.

## Examples

### Example 1: Connect Any REST API to AI Agents via OpenAPI Import

Import any REST API into the PlanVault tool catalog by uploading an OpenAPI 3.x spec via the Admin API. No SDK required — PlanVault generates typed tool definitions automatically.

→ [examples/01-openapi-import/](examples/01-openapi-import/)

### Example 2: Trigger a LangGraph Agent via PlanVault Webhook

Wrap an existing LangGraph agent as a PlanVault HTTP tool so the governed planner can call it as one step within a larger execution plan, including retries, secret injection, and approval gates.

→ [examples/02-langgraph-webhook/](examples/02-langgraph-webhook/)

### Example 3: Build a Secure MCP Host with Node.js and PlanVault

Register a Node.js stdio MCP server with PlanVault so its tools are available to any session in your organisation — with the same audit trail, RBAC, and secret injection as HTTP tools.

→ [examples/03-mcp-host-nodejs/](examples/03-mcp-host-nodejs/)

### Example 4: Add Human-in-the-Loop Approval Gates to AI Tool Calls

Implement a FastAPI tool server that holds execution pending human approval before performing irreversible actions such as sending messages or modifying production records.

→ [examples/04-hitl-approval-gate/](examples/04-hitl-approval-gate/)

### Example 5: Use PlanVault as a Governed AI Execution Step in n8n Workflows

Trigger PlanVault sessions from an n8n automation and stream results back into your workflow — combining no-code orchestration with governed AI execution.

→ [examples/05-n8n-integration/](examples/05-n8n-integration/)

---

## Reference implementations

Self-contained samples for the Runtime API, inbound webhooks, and MCP.

| Path | Description |
|------|-------------|
| [frontend/react-chat](frontend/react-chat/) | React + SSE chat client with plan graph, slots, HITL modal, and signal delivery |
| [webhooks/kafka-trigger](webhooks/kafka-trigger/) | Kafka consumers → HMAC-signed inbound webhook (Python, Java, Scala) |
| [mcp/python-sqlite](mcp/python-sqlite/) | stdio MCP server over SQLite (Python, FastMCP) |
| [low-code/n8n](low-code/n8n/) | n8n workflow exports (inbound trigger + outbound tool demo) |
| [scripts/bash-e2e](scripts/bash-e2e/) | curl + jq session smoke test with HITL and signal delivery |

Copy [`.env.example`](.env.example) to `.env` and fill values. **`PLANVAULT_BASE_URL` defaults to `https://api.planvault.ai`** (no trailing slash; examples strip it when building paths).

---

## Self-hosted deployment

PlanVault can be deployed inside your own AWS or GCP VPC — your data never leaves your network. An air-gapped option is available for regulated environments.

See the [security and deployment documentation](https://planvault.ai/security) for architecture details, BYOK encryption, and data residency guarantees. Docker Compose and Helm chart references are available to design partners — contact us at [planvault.ai](https://planvault.ai) for access.

---

## Getting started in 2 days

| Resource | URL |
|----------|-----|
| Product guide | [planvault.ai/docs](https://planvault.ai/docs) |
| API reference | [planvault.ai/api-docs](https://planvault.ai/api-docs) |
| Security & data residency | [planvault.ai/security](https://planvault.ai/security) |
| Early access | [planvault.ai](https://planvault.ai) |

---

## Runtime API reference

All authenticated Runtime calls use **`/api/v1/projects/{projectId}/…`** with `Authorization: Bearer <project-api-key>`. Full OpenAPI spec: [planvault.ai/api-docs](https://planvault.ai/api-docs).

- **Project in the URL** — all authenticated Runtime calls use **`/api/v1/projects/{projectId}/…`** (the **`projectId`** must match the project API key). There is no `X-Project-Id` header. Set **`PLANVAULT_PROJECT_ID`** for `scripts/bash-e2e` and **`VITE_PLANVAULT_PROJECT_ID`** (or the UI field) for the React sample.
- **Send prompts** — `POST /api/v1/projects/{projectId}/sessions/{id}/messages` with **`{"message":"..."}`** (optional **`Idempotency-Key`**). The API answers **`202 Accepted`** with **`messageId`** while planning runs asynchronously. Track progress with SSE **`GET .../projects/{projectId}/sessions/{id}/chat`** or **`GET .../history`** — there is **no** **`GET .../messages/{messageId}/status`** on current servers. Legacy paths without **`projectId`** and **`POST .../prompt`** are removed.
- **HITL / plan actions** — `POST /api/v1/projects/{projectId}/sessions/{id}/actions` with `{"action":"approve"}`, `reject`, or `fill_slots` (as in `react-chat` / bash script).
- **`wait_for_signal` callbacks** — when the planner calls the native `wait_for_signal` tool the session pauses and the SSE stream emits an **`awaiting_signal`** event (`tokenId`, `nodeId`, `expiresAt`, `onTimeout`). An external system delivers the signal via `POST /api/v1/projects/{projectId}/callbacks/{tokenId}` with `Authorization: Bearer {tokenId}:{secret}` (the `secret` is available in the session's tool-call context). Body must be a JSON object. Response codes: `200 {}` (delivered), `200 {"code":"SIGNAL_ALREADY_DELIVERED"}` (idempotent), `409 {"code":"SIGNAL_PAYLOAD_CONFLICT"}` (different body for completed token), `410 {"code":"SIGNAL_EXPIRED"}` (token timed out), `404` (bad token or wrong secret). SSE emits **`signal_received`** (`tokenId`, `nodeId`, `payloadKeys`) when the signal resumes the session, or **`signal_timed_out`** (`tokenId`, `nodeId`, `policy`) on expiry. `GET .../history` persists all three event types.
- **Tools** — ingest into the **org** catalog with Admin **`POST /admin/v1/orgs/{orgId}/tools`** (**201** + `toolId`) and **`PUT /admin/v1/orgs/{orgId}/tools/{toolId}`** for full replace. Runtime (project key): **`GET /api/v1/projects/{projectId}/tools`**, integrations list **`GET .../tools?type=integration`**, enable/update with **`PUT .../tools/integrations/{alias}`**, plus batch endpoints — see **[API documentation](https://planvault.ai/api-docs)**.
- **Create session** — `POST /api/v1/projects/{projectId}/sessions` with optional **`contextVars`**, **`externalUserId`**, **`tags`**, **`secrets`** (see OpenAPI; this repo sends **`contextVars`** as a JSON object, often `{}`). Sending the first user turn is a separate **`POST .../messages`** call.
- **Planner output:** org/project settings set **`plannerMode`** (e.g. **`structured_json`**, **`python_dsl`**). The Runtime SSE **`started`** / **`slots_required`** payloads include a display **`planGraph`** (`{ "nodes": [...] }` with `kind`: `assignment`, `call`, `if`, `for`, `reply`, `fail`). Clients can ignore unknown fields.
- **SSE:** besides tool and confirmation events, the server may emit **`slots_plan_summary`** (optional plain-language text shortly after **`slots_required`**, uses org/project **`utilityModel`** when set), **`run_phase`** (`selecting_tools`, `planner_llm`, …), and **`replan`**. **`GET .../sessions/{id}/history`** persists the same streamed shapes plus extra types that never appear on the live SSE connection (e.g. **`prompt`**, **`tool_selection`**, **`plan_summary`**, **`slots_cancelled`**, **`llm_reply`**).
- **Org LLM credentials (Admin API):** organisations can store **multiple named cloud vendor keys** — `POST /admin/v1/orgs/{orgId}/llm/providers` with JSON **`name`**, **`vendor`**, **`apiKey`** (verify with `POST .../providers/{providerId}/verify`; update with `PATCH .../providers/{providerId}`). Model allow-list entries can use `provider` = **`cloud:{uuid}`**. **Custom backends** are under **`/admin/v1/orgs/{orgId}/llm/custom-providers`** (**`custom:{uuid}`** in models). Discover models via `GET .../custom-providers/{providerId}/models`. Full route tables: **[API documentation](https://planvault.ai/api-docs)**.
- **HTTP errors** from the API use **RFC 7807** `application/problem+json` (e.g. admin/planner may return `type`: `urn:planvault:problem:MODEL_UNSUPPORTED_FEATURE` when structured JSON is forced but the model does not support it; deleting an org tool still referenced by saved tool scenarios without `confirmDeleteScenarios=true` may return `urn:planvault:problem:TOOL_DELETE_BLOCKED_BY_SCENARIOS`, HTTP **409**).
- **Request correlation** — You may send optional **`X-Request-Id`** (or **`X-Correlation-ID`**, W3C **`traceparent`**). The API echoes **`X-Request-Id`** on responses and sets **`instance`** on error bodies to the same opaque id when known (use for support / log grep). Browser `fetch` can read the header because CORS exposes response headers. The **bash** and **React** samples send **`X-Request-Id`**; Kafka workers add one per outbound webhook POST. See the PlanVault **[api-docs](https://planvault.ai/api-docs)**.
- **Public inbound webhooks** (`POST /api/v1/orgs/.../webhooks/...`): many rejections (bad HMAC, wrong trigger, disabled trigger) return **HTTP 404** with a generic problem body — do not assume **403**. See **[API documentation](https://planvault.ai/api-docs)**.

---

## License

This repository is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for scope. [CONTRIBUTING.md](CONTRIBUTING.md) applies to contributions.

**CI:** GitHub only runs workflows from the repo root `.github/workflows/`. This tree includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for when `planvault-examples` is its own repository.
