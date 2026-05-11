# Use PlanVault as a Governed AI Execution Step in n8n Workflows

**License:** [Apache-2.0](../../LICENSE)

n8n is a popular open-source workflow automation platform. This example shows how to add PlanVault as an AI execution step inside an existing n8n workflow — combining no-code automation with governed, auditable AI agent execution.

## Problem

n8n can trigger actions and move data between systems, but it has no built-in mechanism for multi-step AI reasoning with approval gates, secret injection, or fault-tolerant replanning. Adding a PlanVault session as a workflow node gives you governed AI execution without leaving n8n: the workflow drives the trigger logic, PlanVault handles the AI decision-making, and results flow back into n8n for downstream actions.

## What this workflow does

1. **Webhook trigger** — receives an incoming request (e.g. a customer support ticket or IoT alert).
2. **Create PlanVault session** — `POST /api/v1/projects/{projectId}/sessions`.
3. **Send message** — `POST .../sessions/{id}/messages` with the incoming payload as the prompt.
4. **Poll history** — loop until PlanVault emits `done` or `error` in `GET .../history`.
5. **Extract result** — parse the last `llm_reply` event from history.
6. **Continue workflow** — pass the AI result to downstream n8n nodes (Slack, database, email, etc.).

## Import the workflow

1. Open n8n and go to **Workflows → Import from file**.
2. Select [`n8n-workflow.json`](n8n-workflow.json).
3. Set the following credentials / environment values in n8n:
   - `PLANVAULT_BASE_URL` — `https://api.planvault.ai` (or your self-hosted URL)
   - `PLANVAULT_API_KEY` — your project API key (`sk_live_…`)
   - `PLANVAULT_PROJECT_ID` — UUID of the project

## Helper script

[`planvault-node.js`](planvault-node.js) is a reusable **Code node** snippet for n8n that encapsulates the session-create → send-message → poll loop in a single node. Paste it into a **Code** node if you prefer not to import the full workflow.

```javascript
// Paste into an n8n Code node.
// Input: $json.prompt (string)
// Output: { result, sessionId, events }

const BASE = $env.PLANVAULT_BASE_URL.replace(/\/$/, "");
const PROJECT = $env.PLANVAULT_PROJECT_ID;
const KEY = $env.PLANVAULT_API_KEY;
const headers = { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" };

// 1. Create session
const sess = await $http.request({
  method: "POST",
  url: `${BASE}/api/v1/projects/${PROJECT}/sessions`,
  headers,
  body: JSON.stringify({ contextVars: {}, tags: ["n8n"] }),
});
const sessionId = sess.id;

// 2. Send message
await $http.request({
  method: "POST",
  url: `${BASE}/api/v1/projects/${PROJECT}/sessions/${sessionId}/messages`,
  headers,
  body: JSON.stringify({ message: $json.prompt }),
});

// 3. Poll history
const deadline = Date.now() + 120_000;
let events = [];
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 2000));
  const hist = await $http.request({
    method: "GET",
    url: `${BASE}/api/v1/projects/${PROJECT}/sessions/${sessionId}/history`,
    headers,
  });
  events = hist.events ?? [];
  const terminal = events.find(e => e.eventType === "done" || e.eventType === "error");
  if (terminal) break;
}

// 4. Extract last LLM reply
const reply = [...events].reverse().find(e => e.eventType === "llm_reply");
return [{ json: { result: reply?.content ?? "", sessionId, events } }];
```

## Workflow JSON structure

The [`n8n-workflow.json`](n8n-workflow.json) file contains a complete importable workflow with the following nodes:

| Node | Type | Purpose |
|------|------|---------|
| Webhook | `n8n-nodes-base.webhook` | Receives the incoming trigger |
| Create Session | `n8n-nodes-base.httpRequest` | `POST /sessions` |
| Send Message | `n8n-nodes-base.httpRequest` | `POST /sessions/{id}/messages` |
| Wait 2s | `n8n-nodes-base.wait` | Delay before first history poll |
| Poll History | `n8n-nodes-base.httpRequest` | `GET /sessions/{id}/history` |
| Check Done | `n8n-nodes-base.if` | Check for `done`/`error` in events |
| Loop | `n8n-nodes-base.splitInBatches` | Retry poll up to 60 times |
| Extract Result | `n8n-nodes-base.code` | Parse last `llm_reply` from history |
| Respond | `n8n-nodes-base.respondToWebhook` | Return result to caller |

## How it works

1. PlanVault receives the session message and begins planning. The planner selects tools from the org catalog and executes them with full audit logging.
2. n8n polls `GET .../history` every 2 seconds. The `eventType` field on each history row is the same as SSE event types (`run_phase`, `tool_start`, `tool_end`, `done`, `error`).
3. When `done` appears in history, n8n extracts the `llm_reply` content and passes it to the next node in the workflow.
4. If `error` appears, n8n can branch to an error-handling path (retry, alert, escalate).

For real-time streaming instead of polling, use SSE (`GET .../sessions/{id}/chat`) from a long-running process or a self-hosted n8n instance with streaming support.

## Links

- [API reference](https://planvault.ai/api-docs) — session lifecycle, history event types
- [Product guide](https://planvault.ai/docs) — session creation, polling vs SSE
- [Security](https://planvault.ai/security) — credential storage and EU data residency
