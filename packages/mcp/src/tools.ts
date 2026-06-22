import { ContextStore } from "./store.js";

/** MCP tool result shape (text content blocks). */
export interface McpTextResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ContextTool {
  name: string;
  description: string;
  handler(args: Record<string, unknown>): McpTextResult;
}

const text = (t: string, isError = false): McpTextResult => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError: true } : {}),
});

/**
 * The two context-store tools, as transport-agnostic handlers (the SDK wiring in
 * server.ts adapts these). Kept pure so they're unit-testable without a client.
 */
export function buildContextTools(store: ContextStore): ContextTool[] {
  return [
    {
      name: "context.put",
      description:
        "Store a context block (file, stack, prior output) and get a short id back, so later turns can reference it instead of re-sending the whole thing.",
      handler(args) {
        const content = typeof args.content === "string" ? args.content : "";
        if (!content) return text("error: 'content' (string) is required", true);
        const label = typeof args.label === "string" ? args.label : undefined;
        const stored = store.put(content, label);
        return text(JSON.stringify({ id: stored.id, bytes: stored.bytes, label: stored.label }));
      },
    },
    {
      name: "context.get",
      description: "Expand a previously stored context id back to its full content.",
      handler(args) {
        const id = typeof args.id === "string" ? args.id : "";
        const content = store.get(id);
        if (content === undefined) return text(`error: no context with id '${id}'`, true);
        return text(content);
      },
    },
  ];
}
