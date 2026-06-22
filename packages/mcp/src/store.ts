/**
 * Content store behind the MCP context tools.
 *
 * MCP-aware clients call `context.put` to stash a large, stable block (project
 * stack, a file, prior output) once and get back a short id. On later turns they
 * send the id instead of the whole block; `context.get` expands it. That's the
 * cross-turn "don't re-send unchanged context" win, exposed to clients that
 * speak MCP rather than going through the proxy.
 *
 * Pure + dependency-free so it's trivially testable; identical content dedups to
 * the same id.
 */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface StoredContext {
  id: string;
  bytes: number;
  label?: string;
}

export class ContextStore {
  private readonly byId = new Map<string, string>();
  private readonly labels = new Map<string, string>();

  /** Store content (idempotent by hash) and return its stable id. */
  put(content: string, label?: string): StoredContext {
    const id = "ctx_" + fnv1a(content);
    this.byId.set(id, content);
    if (label) this.labels.set(id, label);
    return { id, bytes: content.length, label };
  }

  /** Expand an id back to its content, or undefined if unknown. */
  get(id: string): string | undefined {
    return this.byId.get(id);
  }

  list(): StoredContext[] {
    return [...this.byId.entries()].map(([id, content]) => ({
      id,
      bytes: content.length,
      label: this.labels.get(id),
    }));
  }

  clear(): void {
    this.byId.clear();
    this.labels.clear();
  }
}
