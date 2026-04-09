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
- **Send prompts** — `POST /api/v1/projects/{projectId}/sessions/{id}/messages` with **`{"message":"..."}`** only. The API answers **`202 Accepted`** with **`messageId`** while planning runs asynchronously; poll **`GET /api/v1/projects/{projectId}/sessions/{id}/messages/{messageId}/status`** for coarse phases (`planning`, `executing`, `completed`, …) or rely on SSE **`GET .../sessions/{id}/chat`** / **`GET .../sessions/{id}/history`**. Legacy paths without **`projectId`** and **`POST .../prompt`** are removed on current servers.
- **HITL / plan actions** — `POST /api/v1/projects/{projectId}/sessions/{id}/actions` with `{"action":"approve"}`, `reject`, or `fill_slots` (as in `react-chat` / bash script).
- **Tools (Runtime)** — project-scoped catalog: **`GET /api/v1/projects/{projectId}/tools`**; integrations only: **`GET /api/v1/projects/{projectId}/tools?type=integration`**. Register with **`POST /api/v1/projects/{projectId}/tools`**, full replace by id with **`PUT /api/v1/projects/{projectId}/tools/{toolId}`**. Organisation-wide catalog remains under Admin **`/admin/orgs/{orgId}/tools`**. See **[API documentation](https://planvault.ai/api-docs)**.
- **Create session** — `POST /api/v1/projects/{projectId}/sessions` with optional **`contextVars`**, **`externalUserId`**, **`tags`**, **`secrets`** (see OpenAPI; this repo sends **`contextVars`** as a JSON object, often `{}`). Sending the first user turn is a separate **`POST .../messages`** call.
- **Planner output:** org/project settings set **`plannerMode`** (e.g. **`structured_json`**, **`python_dsl`**). The Runtime SSE **`started`** / **`slots_required`** payloads include a display **`planGraph`** (`{ "nodes": [...] }` with `kind`: `assignment`, `call`, `if`, `for`, `reply`, `fail`). Clients can ignore unknown fields.
- **SSE:** besides tool and confirmation events, the server may emit **`slots_plan_summary`** (optional plain-language text shortly after **`slots_required`**, uses org/project **`utilityModel`** when set), **`run_phase`** (`selecting_tools`, `planner_llm`, …), and **`replan`**. **`GET .../sessions/{id}/history`** persists the same streamed shapes plus extra types that never appear on the live SSE connection (e.g. **`prompt`**, **`tool_selection`**, **`plan_summary`**, **`slots_cancelled`**, **`llm_reply`**).
- **Org LLM credentials (Admin API):** organisations can store **multiple named cloud vendor keys** — `POST /admin/orgs/{orgId}/llm/providers` with JSON **`name`**, **`vendor`**, **`apiKey`** (verify connectivity with `POST .../providers/{providerId}/verify`; update with `PATCH .../providers/{providerId}`). Model allow-list entries can use `provider` = **`cloud:{uuid}`** for those rows. **Custom backends** (your own `api_base`, e.g. Ollama or self-hosted OpenAI-compatible) are managed under `/admin/orgs/{orgId}/llm/custom-providers` and referenced as **`custom:{uuid}`**. Discover models from a custom base via `GET .../custom-providers/{providerId}/models` (not via `.../llm/catalog/...` with `custom:`). Full route tables: **[API documentation](https://planvault.ai/api-docs)**.
- **HTTP errors** from the API use **RFC 7807** `application/problem+json` (e.g. admin/planner may return `type`: `urn:planvault:problem:MODEL_UNSUPPORTED_FEATURE` when structured JSON is forced but the model does not support it; deleting an org tool still referenced by saved tool scenarios without `confirmDeleteScenarios=true` may return `urn:planvault:problem:TOOL_DELETE_BLOCKED_BY_SCENARIOS`, HTTP **409**).
- **Public inbound webhooks** (`POST /api/v1/orgs/.../webhooks/...`): many rejections (bad HMAC, wrong trigger, disabled trigger) return **HTTP 404** with a generic problem body — do not assume **403**. See **[API documentation](https://planvault.ai/api-docs)**.

## License

This directory is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for scope. [CONTRIBUTING.md](CONTRIBUTING.md) applies to contributions.

**CI:** GitHub only runs workflows from the repo root `.github/workflows/`. This tree includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for when `planvault-examples` is its own repository; in the monorepo, either add a root workflow that invokes these checks or run them locally (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
