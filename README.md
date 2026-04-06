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

- **Create session** (`POST /api/v1/sessions`): body still requires `externalUserId` and **`contextVars`** (JSON object; use `{}` if none). Optional: `model`, `secrets`, `prompt`, `stream` — see [`docs/api-reference.md`](../docs/api-reference.md#runtime-api).
- **Planner output:** org/project settings may set **`plannerMode`** (`auto`, `structured_json`, `python_dsl`). The Runtime SSE **`started`** / **`slots_required`** payloads include a display **`planGraph`** (`{ "nodes": [...] }` with `kind`: `assignment`, `call`, `if`, `for`, `reply`, `fail`). Clients can ignore unknown fields.
- **SSE:** besides tool and confirmation events, the server may emit **`run_phase`** (`selecting_tools`, `planner_llm`, …) and **`replan`**. History from `GET .../history` mirrors persisted `eventType` values.
- **HTTP errors** from the API use **RFC 7807** `application/problem+json` (e.g. admin/planner may return `type`: `urn:planvault:problem:MODEL_UNSUPPORTED_FEATURE` when structured JSON is forced but the model does not support it).

## License

This directory is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for scope. [CONTRIBUTING.md](CONTRIBUTING.md) applies to contributions.

**CI:** GitHub only runs workflows from the repo root `.github/workflows/`. This tree includes [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for when `planvault-examples` is its own repository; in the monorepo, either add a root workflow that invokes these checks or run them locally (see [`CONTRIBUTING.md`](CONTRIBUTING.md)).
