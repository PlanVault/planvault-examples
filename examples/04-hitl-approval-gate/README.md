# Add Human-in-the-Loop Approval Gates to AI Tool Calls

**License:** [Apache-2.0](../../LICENSE)

AI agents that can send messages, modify records, or trigger financial transactions need a human review step before irreversible actions execute. PlanVault supports two complementary approval gate patterns: **plan-level confirmation** (built into the runtime, zero additional code) and **tool-level blocking** (implemented in your tool server, shown in this example).

## Problem

When an AI agent autonomously calls a tool that has real-world consequences — sending an email, placing an order, updating a production record — there is no safe way to undo a mistake. A human-in-the-loop approval gate pauses execution, notifies a reviewer, and only proceeds after an explicit approve/reject decision.

## Pattern 1: Plan-level confirmation (built-in)

Enable `requireConfirmation` in your project settings. PlanVault will emit a `confirm_plan_required` SSE event before any tool executes. Your client (React, CLI, or automation) approves or rejects via the actions endpoint:

```bash
# Approve the planned tool calls
curl -s -X POST "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/sessions/$SESSION_ID/actions" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve"}'

# Reject (session remains open; send a new message to re-plan)
curl -s -X POST "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/sessions/$SESSION_ID/actions" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "reject"}'
```

This requires no changes to your tool servers. See `scripts/bash-e2e/script.sh` for a polling example.

## Pattern 2: Tool-level blocking (this example)

For finer-grained control — approving individual tool calls rather than an entire plan — implement a blocking tool server. The server holds the HTTP request open, notifies a human reviewer, and responds only after approval.

### Quick start

```bash
cd examples/04-hitl-approval-gate
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn
python tool_with_approval.py
# Listening on http://0.0.0.0:8001
```

### Register as a PlanVault tool

```bash
curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/tools" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "send-message",
    "displayName": "Send Message (HITL gated)",
    "baseUrl": "https://your-tool-server.example.com",
    "openApiSpec": {
      "openapi": "3.0.3",
      "info": { "title": "HITL send-message", "version": "1.0.0" },
      "paths": {
        "/tools/send-message": {
          "post": {
            "operationId": "sendMessage",
            "summary": "Send a message (requires human approval)",
            "requestBody": {
              "required": true,
              "content": { "application/json": { "schema": {
                "type": "object",
                "properties": {
                  "recipient": { "type": "string" },
                  "subject":   { "type": "string" },
                  "body":      { "type": "string" }
                },
                "required": ["recipient", "subject", "body"]
              }}}
            },
            "responses": { "200": { "description": "Sent or rejected" } }
          }
        }
      }
    }
  }'
```

### Approve a pending request

```bash
# List pending approvals
curl http://localhost:8001/pending

# Approve
curl -s -X POST "http://localhost:8001/approve/<request_id>" \
  -H "Content-Type: application/json" \
  -d '{"approved": true}'

# Reject
curl -s -X POST "http://localhost:8001/approve/<request_id>" \
  -H "Content-Type: application/json" \
  -d '{"approved": false}'
```

## Working code

Full implementation in [`tool_with_approval.py`](tool_with_approval.py). Core logic:

```python
@app.post("/tools/send-message")
async def send_message(req: SendMessageRequest) -> dict:
    request_id = str(uuid.uuid4())
    event = asyncio.Event()
    _pending[request_id] = event

    # Notify a human reviewer (replace with Slack, email, PagerDuty, etc.)
    print(f"[HITL] Approval required: {request_id} → to={req.recipient!r}")

    # Block until approved or timeout (5 minutes)
    await asyncio.wait_for(event.wait(), timeout=300)

    if request_id not in _approved:
        raise HTTPException(403, "Action rejected by operator")

    # Execute only after approval
    return {"status": "sent", "request_id": request_id}
```

## How it works

1. PlanVault calls `POST /tools/send-message` during plan execution.
2. The tool server generates a `request_id`, stores a pending event, and sends a notification to the human reviewer (Slack message, email, webhook — add your own).
3. The HTTP request is held open (async wait) for up to 5 minutes.
4. When the reviewer calls `POST /approve/{request_id}`, the event is set and the tool responds to PlanVault.
5. If the reviewer rejects or the timeout is reached, PlanVault receives a 403/408 and can either surface the failure to the user or trigger a replan.

For production use, replace the in-memory `_pending` dict with Redis or a database, and the `print` notification with your real alerting stack.

## Links

- [API reference](https://planvault.ai/api-docs) — session actions (`approve` / `reject`) and SSE events
- [Product guide](https://planvault.ai/docs) — plan confirmation and HITL configuration
- [Security](https://planvault.ai/security) — audit trail for all tool calls and operator actions
