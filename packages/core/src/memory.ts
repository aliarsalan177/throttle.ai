import type { ContextRegistry } from "./types.js";

/**
 * Cross-turn context registry (content-hash → stable id).
 *
 * A later version backs this with SQLite (`better-sqlite3`) for persistence across proxy
 * restarts. For scaffolding we ship an in-memory LRU-ish map so the dedup stage
 * can be wired end-to-end and unit-tested without I/O.
 *
 * Stores ONLY a hash + byte count here — never prompt bodies — so this layer is
 * safe regardless of the `--no-store` setting.
 */
export class InMemoryContextRegistry implements ContextRegistry {
  private readonly bySession = new Map<string, Map<string, string>>();
  private seq = 0;

  lookup(sessionId: string, hash: string): string | undefined {
    return this.bySession.get(sessionId)?.get(hash);
  }

  register(sessionId: string, hash: string, _bytes: number): string {
    let session = this.bySession.get(sessionId);
    if (!session) {
      session = new Map();
      this.bySession.set(sessionId, session);
    }
    const existing = session.get(hash);
    if (existing) return existing;
    const id = `ctx_${(this.seq++).toString(36)}`;
    session.set(hash, id);
    return id;
  }

  /** Test/utility helper: forget everything (not part of the interface). */
  clear(): void {
    this.bySession.clear();
    this.seq = 0;
  }
}
