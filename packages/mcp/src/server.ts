import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ContextStore } from "./store.js";
import { buildContextTools } from "./tools.js";

/**
 * MCP server exposing the TRE context store.
 *
 * Scope: MCP injects *context and tools*, not the user's primary prompt, and
 * only for MCP-aware clients. It is NOT a full interceptor — that's the proxy's
 * job. This server lets MCP-aware clients register/fetch stable context ids
 * (`context.put` / `context.get`) instead of re-sending unchanged blocks.
 */
export interface TreMcp {
  server: McpServer;
  store: ContextStore;
}

const INPUT_SCHEMAS: Record<string, z.ZodRawShape> = {
  "context.put": { content: z.string(), label: z.string().optional() },
  "context.get": { id: z.string() },
};

/** Build the MCP server with the context tools registered. */
export function createMcpServer(store: ContextStore = new ContextStore()): TreMcp {
  const server = new McpServer({ name: "tre-context", version: "0.0.0" });

  for (const tool of buildContextTools(store)) {
    server.tool(
      tool.name,
      tool.description,
      INPUT_SCHEMAS[tool.name] ?? {},
      async (args: Record<string, unknown>) => tool.handler(args),
    );
  }

  return { server, store };
}
