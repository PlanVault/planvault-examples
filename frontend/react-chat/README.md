# React Runtime chat example

Vite + React 18 + TypeScript. Uses `fetch` with a readable stream for SSE so the project API key can be sent in `Authorization`.

## Run

```bash
cp ../../.env.example ../../.env   # optional
npm install
# Defaults to https://api.planvault.ai; override: VITE_PLANVAULT_BASE_URL=... VITE_PLANVAULT_API_KEY=... npm run dev
npm run dev
```

Set **API base URL** and **project API key** in the UI (or via `VITE_PLANVAULT_*` in `.env`).

The sample handles **`confirm_plan_required`** (approve/reject), **`slots_required`** (submit **`fill_slots`** via `POST .../actions`), and shows optional **`slots_plan_summary`** from SSE when the server sends it.

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
