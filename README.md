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

- **Send prompts** — use `POST /api/v1/sessions/{id}/messages` with `{"message":"...","autoExecute":true|false}` (this repo’s React sample and `scripts/bash-e2e` already do). Legacy `POST .../prompt` is deprecated.
- **HITL / plan actions** — use `POST /api/v1/sessions/{id}/actions` with `{"action":"approve"}`, `reject`, or `fill_slots` (as in `react-chat` / bash script). Legacy `POST .../approve`, `.../reject`, `.../slots` are deprecated.
- **Org tool catalog (Runtime)** — list the full org catalog with `GET /api/v1/tools?scope=org`. `GET /api/v1/tools/catalog` is deprecated; deprecated success responses may include an HTTP `Deprecation: true` header ([RFC 8594](https://datatracker.ietf.org/doc/html/rfc8594)).
- **Create session** (`POST /api/v1/sessions`): body requires **`contextVars`** (JSON object; use `{}` if none). **`externalUserId`** is optional (omit for anonymous sessions; stored as HMAC when set). Optional **`tags`**: string array on the session (case-sensitive) for admin filtering, org **GDPR export/erase by tag**, and spend/usage breakdowns in the UI. Also optional: `model`, `secrets`, `prompt`, `stream` — see **[API documentation](https://planvault.ai/api-docs)** (includes embedded Swagger).
- **Planner output:** org/project settings may set **`plannerMode`** (`auto`, `structured_json`, `python_dsl`). The Runtime SSE **`started`** / **`slots_required`** payloads include a display **`planGraph`** (`{ "nodes": [...] }` with `kind`: `assignment`, `call`, `if`, `for`, `reply`, `fail`). Clients can ignore unknown fields.
- **SSE:** besides tool and confirmation events, the server may emit **`slots_plan_summary`** (optional plain-language text shortly after **`slots_required`**, uses org/project **`utilityModel`** when set), **`run_phase`** (`selecting_tools`, `planner_llm`, …), and **`replan`**. **`GET .../history`** persists the same streamed shapes plus extra types that never appear on the live SSE connection (e.g. **`prompt`**, **`tool_selection`**, **`plan_summary`**, **`slots_cancelled`**, **`llm_reply`**).
- **Org LLM credentials (Admin API):** organisations can store **multiple named cloud vendor keys** — `POST /admin/orgs/{orgId}/llm/providers` with JSON **`name`**, **`vendor`**, **`apiKey`** (verify connectivity with `POST .../providers/{providerId}/verify`; update with `PATCH .../providers/{providerId}`). Model allow-list entries can use `provider` = **`cloud:{uuid}`** for those rows. **Custom backends** (your own `api_base`, e.g. Ollama or self-hosted OpenAI-compatible) are managed under `/admin/orgs/{orgId}/llm/custom-providers` and referenced as **`custom:{uuid}`**. Discover models from a custom base via `GET .../custom-providers/{providerId}/models` (not via `.../llm/catalog/...` with `custom:`). Full route tables: **[API documentation](https://planvault.ai/api-docs)**.
- **HTTP errors** from the API use **RFC 7807** `application/problem+json` (e.g. admin/planner may return `type`: `urn:planvault:problem:MODEL_UNSUPPORTED_FEATURE` when structured JSON is forced but the model does not support it; deleting an org tool still referenced by saved tool scenarios without `confirmDeleteScenarios=true` may return `urn:planvault:problem:TOOL_DELETE_BLOCKED_BY_SCENARIOS`, HTTP **409**).
- **Public inbound webhooks** (`POST /api/v1/orgs/.../webhooks/...`): many rejections (bad HMAC, wrong trigger, disabled trigger) return **HTTP 404** with a generic problem body — do not assume **403**. See **[API documentation](https://planvault.ai/api-docs)**.

## License

This directory is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for scope. [CONTRIBUTING.md](CONTRIBUTING.md) applies to contributions.

**CI:** GitHub only runs workflows from the repo root `.github/workflows/`. This tree includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for when `planvault-examples` is its own repository; in the monorepo, either add a root workflow that invokes these checks or run them locally (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
