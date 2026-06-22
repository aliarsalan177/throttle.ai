/**
 * Per-session store of the last-seen content of each "file" referenced in a
 * conversation. The filediff stage uses it to send a diff instead of re-sending
 * an unchanged-or-slightly-changed file across turns.
 *
 * Holds the user's own code, so it lives only in memory and only when the proxy
 * is configured to store (same gate as history).
 */
export interface FileVersionStore {
  /** Return the previously stored content for (session, path), if any. */
  get(sessionId: string, path: string): string | undefined;
  /** Store/replace the content for (session, path). */
  put(sessionId: string, path: string, content: string): void;
  clear(sessionId?: string): void;
}

export class InMemoryFileVersionStore implements FileVersionStore {
  private readonly bySession = new Map<string, Map<string, string>>();

  get(sessionId: string, path: string): string | undefined {
    return this.bySession.get(sessionId)?.get(path);
  }

  put(sessionId: string, path: string, content: string): void {
    let m = this.bySession.get(sessionId);
    if (!m) {
      m = new Map();
      this.bySession.set(sessionId, m);
    }
    m.set(path, content);
  }

  clear(sessionId?: string): void {
    if (sessionId === undefined) this.bySession.clear();
    else this.bySession.delete(sessionId);
  }
}
