# n8n ↔ PlanVault examples

Exports for **n8n 1.x** (tested conceptually with current node types). Import via **Workflows → Import from File**.

Replace placeholders after import:

| Placeholder | Meaning |
|-------------|---------|
| API host (`host` in Code node) | Default `https://api.planvault.ai` (no trailing slash) |
| `YOUR_ORG_ID` | Organization UUID |
| `YOUR_TRIGGER_KEY` | Inbound webhook trigger key |
| `YOUR_WEBHOOK_SECRET` | HMAC secret configured on the trigger |

## Workflow 1 — Outbound tool (`outbound-tool-demo.json`)

Simulates an **outbound webhook** tool target: POST body in → light transform → synchronous JSON response back to PlanVault.

**Nodes:** Webhook → Set → Respond to Webhook.

After import, open the **Webhook** node and set the path (e.g. `planvault-outbound-demo`). Configure your PlanVault **outbound webhook** URL to match your n8n public URL + path.

### Screenshots

- Outbound flow: `images/outbound-flow.png` _(add after capture)_
- Webhook response: `images/outbound-response.png` _(add after capture)_

## Workflow 2 — Inbound trigger (`inbound-trigger-demo.json`)

**Nodes:** Manual Trigger → Set (JSON body) → Code (HMAC-SHA256 hex) → HTTP Request (POST inbound webhook with `X-Signature`).

Use **Execute workflow** to send a test payload without Slack/Google Sheets. For production, replace Manual Trigger with your real trigger node.

The **Code** node uses Node’s `crypto` module to match PlanVault’s `hmac_sha256` check over the **exact** JSON string produced by the Set node (compact, stable field order).

### Screenshots

- Inbound flow: `images/inbound-flow.png` _(add after capture)_

## Minimum n8n version

Use a recent **n8n 1.x** build; node `typeVersion` fields match the JSON in these files. If import warns about versions, upgrade n8n or let the editor migrate nodes.
