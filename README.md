# PlanVault examples

Self-contained samples for Runtime API, inbound webhooks, MCP, and integrations. See each subdirectory for setup.

| Path | Description |
|------|-------------|
| [frontend/react-chat](frontend/react-chat/) | React + SSE chat client |
| [webhooks/kafka-trigger](webhooks/kafka-trigger/) | Kafka consumers → signed inbound webhook |
| [mcp/python-sqlite](mcp/python-sqlite/) | stdio MCP server over SQLite |
| [low-code/n8n](low-code/n8n/) | n8n workflow exports |
| [scripts/bash-e2e](scripts/bash-e2e/) | curl + jq session smoke test |

Copy [`.env.example`](.env.example) to `.env` and fill values. **`PLANVAULT_BASE_URL` defaults to `https://api.planvault.ai`** (no trailing slash; examples strip it when building paths).

### Behaviour vs current PlanVault API

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
- **Request correlation** — You may send optional **`X-Request-Id`** (or **`X-Correlation-ID`**, W3C **`traceparent`**). The API echoes **`X-Request-Id`** on responses and sets **`instance`** on error bodies to the same opaque id when known (use for support / log grep). Browser `fetch` can read the header because CORS exposes response headers. The **bash** and **React** samples send **`X-Request-Id`**; Kafka workers add one per outbound webhook POST. See the PlanVault **`docs/api-reference.md`** section *Request correlation* in the main repository, or **[api-docs](https://planvault.ai/api-docs)**.
- **Public inbound webhooks** (`POST /api/v1/orgs/.../webhooks/...`): many rejections (bad HMAC, wrong trigger, disabled trigger) return **HTTP 404** with a generic problem body — do not assume **403**. See **[API documentation](https://planvault.ai/api-docs)**.

## License

This directory is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for scope. [CONTRIBUTING.md](CONTRIBUTING.md) applies to contributions.

**CI:** GitHub only runs workflows from the repo root `.github/workflows/`. This tree includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for when `planvault-examples` is its own repository; in the monorepo, either add a root workflow that invokes these checks or run them locally (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
