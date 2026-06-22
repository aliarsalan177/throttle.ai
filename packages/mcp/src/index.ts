#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

export { createMcpServer } from "./server.js";
export type { TreMcp } from "./server.js";
export { ContextStore } from "./store.js";
export { buildContextTools } from "./tools.js";
export type { ContextTool, McpTextResult } from "./tools.js";

/** Run the context-store MCP server over stdio (for MCP-aware clients). */
export async function startStdio(): Promise<void> {
  const { server } = createMcpServer();
  await server.connect(new StdioServerTransport());
  // eslint-disable-next-line no-console
  console.error("[tre-mcp] context-store server ready on stdio");
}

// Auto-start when invoked directly as a CLI.
const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  startStdio().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[tre-mcp] failed to start:", err);
    process.exit(1);
  });
}
