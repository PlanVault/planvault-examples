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
- **Create session** (`POST /api/v1/sessions`): body still requires `externalUserId` and **`contextVars`** (JSON object; use `{}` if none). Optional: `model`, `secrets`, `prompt`, `stream` — see [`docs/api-reference.md`](../docs/api-reference.md#runtime-api) if this repo sits next to the main PlanVault tree, or the published API docs / [planvault `docs/api-reference.md`](https://github.com/PlanVault/planvault/blob/main/docs/api-reference.md#runtime-api) on GitHub.
- **Planner output:** org/project settings may set **`plannerMode`** (`auto`, `structured_json`, `python_dsl`). The Runtime SSE **`started`** / **`slots_required`** payloads include a display **`planGraph`** (`{ "nodes": [...] }` with `kind`: `assignment`, `call`, `if`, `for`, `reply`, `fail`). Clients can ignore unknown fields.
- **SSE:** besides tool and confirmation events, the server may emit **`run_phase`** (`selecting_tools`, `planner_llm`, …) and **`replan`**. History from `GET .../history` mirrors persisted `eventType` values.
- **HTTP errors** from the API use **RFC 7807** `application/problem+json` (e.g. admin/planner may return `type`: `urn:planvault:problem:MODEL_UNSUPPORTED_FEATURE` when structured JSON is forced but the model does not support it; deleting an org tool still referenced by saved tool scenarios without `confirmDeleteScenarios=true` may return `urn:planvault:problem:TOOL_DELETE_BLOCKED_BY_SCENARIOS`, HTTP **409**).
- **Public inbound webhooks** (`POST /api/v1/orgs/.../webhooks/...`): many rejections (bad HMAC, wrong trigger, disabled trigger) return **HTTP 404** with a generic problem body — do not assume **403**. See [`docs/api-reference.md`](../docs/api-reference.md) when this tree lives next to the main repo, or the published API docs.

## License

This directory is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for scope. [CONTRIBUTING.md](CONTRIBUTING.md) applies to contributions.

**CI:** GitHub only runs workflows from the repo root `.github/workflows/`. This tree includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for when `planvault-examples` is its own repository; in the monorepo, either add a root workflow that invokes these checks or run them locally (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
