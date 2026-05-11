# Trigger a LangGraph Agent via PlanVault Webhook

**License:** [Apache-2.0](../../LICENSE)

LangGraph excels at stateful, multi-step agent graphs. PlanVault adds the governance layer: fault-tolerant execution, BYOK secret injection, and human-in-the-loop approval gates. This example shows how to expose a LangGraph graph as a PlanVault HTTP tool so the governed planner can call it as one step within a larger plan — with retries, audit logging, and optional confirmation before execution.

## Problem

Running a LangGraph agent directly from user input gives you no audit trail, no approval gates, and no easy way to retry a failed step without re-running the whole graph. Wrapping the graph as a PlanVault tool means the planner decides *when* and *how* to invoke it, with full observability and the ability to hold execution pending a human reviewer.

## Quick start

### 1. Start the bridge server

```bash
cd examples/02-langgraph-webhook
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn
# Add langgraph to requirements if you have a real graph:
# pip install langgraph langchain-openai
python webhook_handler.py
# Listening on http://0.0.0.0:8000
```

### 2. Register the endpoint as a PlanVault HTTP tool

```bash
export PLANVAULT_BASE_URL=https://api.planvault.ai
export ADMIN_BEARER=<your-admin-token>
export ORG_ID=<your-org-uuid>

curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/tools" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "langgraph-agent",
    "displayName": "LangGraph Research Agent",
    "baseUrl": "https://your-bridge.example.com",
    "openApiSpec": {
      "openapi": "3.0.3",
      "info": { "title": "LangGraph bridge", "version": "1.0.0" },
      "paths": {
        "/run": {
          "post": {
            "operationId": "runAgent",
            "summary": "Run the LangGraph agent on a query",
            "requestBody": {
              "required": true,
              "content": { "application/json": { "schema": {
                "type": "object",
                "properties": {
                  "query": { "type": "string", "description": "The user query to process" },
                  "context": { "type": "object", "description": "Optional context key-value pairs" }
                },
                "required": ["query"]
              }}}
            },
            "responses": { "200": { "description": "Agent result" } }
          }
        }
      }
    }
  }'
```

### 3. Enable the tool for your project and run a session

```bash
export PROJECT_ID=<your-project-uuid>
export PLANVAULT_API_KEY=<your-project-api-key>

# Enable the tool
curl -s -X PUT "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/tools/integrations/langgraph-agent" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Create a session and send a prompt — PlanVault will call the LangGraph bridge
SESSION=$(curl -s -X POST "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/sessions" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contextVars": {}}' | jq -r '.id')

curl -s -X POST "$PLANVAULT_BASE_URL/api/v1/projects/$PROJECT_ID/sessions/$SESSION/messages" \
  -H "Authorization: Bearer $PLANVAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Research the latest EU AI Act compliance requirements."}'
```

## Working code

The full implementation is in [`webhook_handler.py`](webhook_handler.py). Core excerpt:

```python
@app.post("/run", response_model=RunResponse)
async def run_agent(req: RunRequest) -> RunResponse:
    result, steps = await _invoke_graph(req.query, req.context)
    return RunResponse(result=result, steps=steps)

async def _invoke_graph(query: str, context: dict) -> tuple[str, list[str]]:
    # Replace with your actual LangGraph StateGraph invocation:
    # from langgraph.graph import StateGraph
    # result = await graph.ainvoke({"messages": [{"role": "user", "content": query}]})
    # return result["output"], result.get("intermediate_steps", [])
    return f"[stub] processed: {query}", []
```

## How it works

1. PlanVault receives a user prompt and runs planning. If the planner decides to use `langgraph-agent`, it emits a `tool_start` event on the SSE stream.
2. PlanVault calls `POST /run` on your bridge server with the parameters the planner chose.
3. Your bridge runs the LangGraph graph and returns the result.
4. PlanVault stores the result in the run event log, emits `tool_end`, and continues planning.
5. If the call fails (network error, 5xx), PlanVault retries with exponential back-off and can surface the failure to the planner for an alternative approach (evidence replan).

## Links

- [API reference](https://planvault.ai/api-docs) — tool registration and session execution
- [Product guide](https://planvault.ai/docs) — planner modes and tool catalog
- [Security](https://planvault.ai/security) — secret injection so LLM keys stay out of prompts
