# Build a Secure MCP Host with Node.js and PlanVault

**License:** [Apache-2.0](../../LICENSE)

The Model Context Protocol (MCP) lets you expose any data source or service as a set of typed tools over a stdio transport. PlanVault can register an MCP server at the org level and make its tools available to every session with the same audit trail, RBAC, and BYOK secret injection as HTTP tools.

## Problem

MCP servers are stateless stdio processes — they have no built-in access control, audit logging, or secret management. Registering an MCP server with PlanVault adds all three: the governed planner decides when each tool is called, credentials are injected post-planning so the LLM never sees them, and every invocation is recorded in the run event log.

## Quick start

### 1. Install dependencies and compile

```bash
cd examples/03-mcp-host-nodejs
npm install
npx tsc
# Compiled output is in dist/index.js
```

### 2. Test the server locally (stdio)

```bash
# MCP stdio: send a tools/list request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

### 3. Register with PlanVault

```bash
export PLANVAULT_BASE_URL=https://api.planvault.ai
export ADMIN_BEARER=<your-admin-token>
export ORG_ID=<your-org-uuid>

curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/mcp/servers" \
  -H "Authorization: Bearer $ADMIN_BEARER" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"node-record-store\",
    \"transport\": \"stdio\",
    \"command\": \"node\",
    \"args\": [\"/absolute/path/to/examples/03-mcp-host-nodejs/dist/index.js\"],
    \"env\": {},
    \"enabled\": true,
    \"syncEnabled\": true
  }"
```

The Admin API has no working-directory field — always use an absolute path in `args`.

### 4. Import tool definitions into the org catalog

```bash
export SERVER_ID=<uuid-from-previous-response>

curl -s -X POST "$PLANVAULT_BASE_URL/admin/v1/orgs/$ORG_ID/mcp/servers/$SERVER_ID/sync" \
  -H "Authorization: Bearer $ADMIN_BEARER"
```

After sync, the tools `get_record` and `list_records` appear in the org catalog and are available to any session.

## Working code

The full implementation is in [`index.ts`](index.ts). Core excerpt:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_record",
      description: "Return a record by ID from the internal store.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Record ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_records",
      description: "List all available record IDs.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === "get_record") {
    const record = DB[(args as { id: string }).id];
    return record
      ? { content: [{ type: "text", text: JSON.stringify(record) }] }
      : { content: [{ type: "text", text: "Not found." }], isError: true };
  }
  // ...
});
```

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

## How it works

1. PlanVault spawns `node dist/index.js` as a child process when the org's MCP server list is initialised.
2. Communication is JSON-RPC 2.0 over stdin/stdout (MCP stdio transport).
3. When the planner calls `get_record`, PlanVault sends a `tools/call` JSON-RPC request to the process and waits for the response.
4. The result is stored in the run event log; PlanVault does not persist the raw response — only the event metadata. Tool output is treated as transient evidence for the current run.
5. If the process exits unexpectedly, PlanVault can restart it on the next invocation (controlled by `syncEnabled`).

## Links

- [API reference](https://planvault.ai/api-docs) — MCP server registration and sync endpoints
- [Product guide](https://planvault.ai/docs) — tool catalog and MCP integration setup
- [Security](https://planvault.ai/security) — BYOK encryption and tool call audit trail
