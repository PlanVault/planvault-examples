// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal Node.js MCP stdio server.
 *
 * Exposes two tools that PlanVault can call after registering this server
 * via the Admin API:
 *   - get_record  — look up a record by ID
 *   - list_records — list all available record IDs
 *
 * Registration (see README.md):
 *   POST /admin/v1/orgs/{orgId}/mcp/servers
 *   { "transport": "stdio", "command": "node",
 *     "args": ["/abs/path/dist/index.js"], ... }
 *
 * Sync tools into org catalog:
 *   POST /admin/v1/orgs/{orgId}/mcp/servers/{serverId}/sync
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// In-memory record store — replace with your real data source.
// ---------------------------------------------------------------------------
interface Record {
  id: string;
  name: string;
  value: string;
  updatedAt: string;
}

const DB: { [id: string]: Record } = {
  rec_001: { id: "rec_001", name: "Alpha", value: "42", updatedAt: "2026-05-01T10:00:00Z" },
  rec_002: { id: "rec_002", name: "Beta", value: "99", updatedAt: "2026-05-02T14:30:00Z" },
  rec_003: { id: "rec_003", name: "Gamma", value: "7", updatedAt: "2026-05-10T08:15:00Z" },
};

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "planvault-mcp-example", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_record",
      description:
        "Return a record by ID. Use list_records first if you do not know the ID.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Record ID (e.g. rec_001)",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "list_records",
      description: "List all available record IDs with their names.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "get_record") {
    const id = (args as { id: string }).id ?? "";
    const record = DB[id];
    if (!record) {
      return {
        content: [{ type: "text", text: `Record not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
    };
  }

  if (name === "list_records") {
    const summary = Object.values(DB).map(({ id, name }) => ({ id, name }));
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
