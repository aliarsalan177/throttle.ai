import { InMemoryContextRegistry } from "@tre/core";

/**
 * MCP server — phase 2 (milestone M5).
 *
 * Scope: MCP injects *context and tools*, not
 * the user's primary prompt, and only for MCP-aware clients. It is NOT a full
 * interceptor — that's the proxy's job. This server's role is to expose the
 * shared context store so MCP-aware clients can register/fetch stable context
 * ids instead of re-sending unchanged blocks.
 *
 * STUB: defines the intended tool surface but does not yet speak the MCP wire
 * protocol. M5 wires this to `@modelcontextprotocol/sdk`.
 */

export interface ContextStoreTool {
  name: string;
  description: string;
}

export const PLANNED_TOOLS: ContextStoreTool[] = [
  {
    name: "context.put",
    description: "Store a context block and return a stable id for cheap re-reference.",
  },
  {
    name: "context.get",
    description: "Expand a previously stored context id back to its full content.",
  },
];

export interface McpServer {
  tools: ContextStoreTool[];
  registry: InMemoryContextRegistry;
}

/** Construct the (stub) server. Real MCP transport binding lands in M5. */
export function createMcpServer(): McpServer {
  return {
    tools: PLANNED_TOOLS,
    registry: new InMemoryContextRegistry(),
  };
}
