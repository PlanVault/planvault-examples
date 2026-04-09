# React Runtime chat example

Vite + React 18 + TypeScript. Uses `fetch` with a readable stream for SSE so the project API key can be sent in `Authorization`. Every request adds a fresh **`X-Request-Id`** (UUID); HTTP errors append **`[support id: …]`** using the response header or RFC 7807 **`instance`** when present.

## Run

```bash
cp ../../.env.example ../../.env   # optional
npm install
# Defaults to https://api.planvault.ai; override: VITE_PLANVAULT_BASE_URL=... VITE_PLANVAULT_API_KEY=... VITE_PLANVAULT_PROJECT_ID=... npm run dev
npm run dev
```

Set **API base URL**, **project ID** (UUID, must match the key’s project), and **project API key** in the UI (or via `VITE_PLANVAULT_*` in `.env`). All Runtime calls use **`/api/v1/projects/{projectId}/…`**.

**Session creation** sends required **`contextVars`** plus optional **`externalUserId`** (leave blank for an anonymous session) and optional **tags** (comma-separated; stored case-sensitively for admin/GDPR/spend tagging).

The sample handles **`confirm_plan_required`** (approve/reject), **`slots_required`** (submit **`fill_slots`** via `POST .../actions`), and shows optional **`slots_plan_summary`** from SSE when the server sends it.

After **`POST .../projects/{projectId}/sessions/{id}/messages`** (**HTTP 202**), the UI shows **`messageId`** for correlation with the SSE stream and history. Current servers do not expose **`GET .../messages/{messageId}/status`**.

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

Output in `dist/`.

**License:** [Apache-2.0](../../LICENSE) (this `planvault-examples` tree).
