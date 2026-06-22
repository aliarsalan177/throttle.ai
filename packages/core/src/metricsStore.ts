import type { Provider } from "./types.js";

/**
 * Per-request metrics store that feeds the dashboard.
 *
 * Holds a bounded ring buffer of recent requests plus running aggregates, so the
 * GUI can render savings over time without the proxy persisting every byte. Pure
 * in-memory; timestamps are supplied by the caller to keep it deterministic and
 * testable. A later version persists this to SQLite.
 */

export interface RequestMetric {
  id: number;
  at: number;
  provider: Provider;
  model: string;
  sessionId: string;
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  durationMs: number;
}

export interface ModelBreakdown {
  model: string;
  requests: number;
  tokensBefore: number;
  saved: number;
}

export interface MetricsAggregate {
  requests: number;
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  savedPct: number;
  avgDurationMs: number;
  byModel: ModelBreakdown[];
}

export interface MetricsStore {
  record(metric: Omit<RequestMetric, "id">): RequestMetric;
  aggregate(): MetricsAggregate;
  /** Most recent requests first, capped at `limit` (default 50). */
  recent(limit?: number): RequestMetric[];
  clear(): void;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export class InMemoryMetricsStore implements MetricsStore {
  private readonly buffer: RequestMetric[] = [];
  private seq = 0;

  /** @param capacity max retained request records (oldest dropped). */
  constructor(private readonly capacity = 1000) {}

  record(metric: Omit<RequestMetric, "id">): RequestMetric {
    const full: RequestMetric = { ...metric, id: this.seq++ };
    this.buffer.push(full);
    if (this.buffer.length > this.capacity) this.buffer.shift();
    return full;
  }

  aggregate(): MetricsAggregate {
    let tokensBefore = 0;
    let tokensAfter = 0;
    let saved = 0;
    let duration = 0;
    const byModel = new Map<string, ModelBreakdown>();

    for (const m of this.buffer) {
      tokensBefore += m.tokensBefore;
      tokensAfter += m.tokensAfter;
      saved += m.saved;
      duration += m.durationMs;
      let b = byModel.get(m.model);
      if (!b) {
        b = { model: m.model, requests: 0, tokensBefore: 0, saved: 0 };
        byModel.set(m.model, b);
      }
      b.requests += 1;
      b.tokensBefore += m.tokensBefore;
      b.saved += m.saved;
    }

    const requests = this.buffer.length;
    return {
      requests,
      tokensBefore,
      tokensAfter,
      saved,
      savedPct: tokensBefore > 0 ? round1((saved / tokensBefore) * 100) : 0,
      avgDurationMs: requests > 0 ? round1(duration / requests) : 0,
      byModel: [...byModel.values()].sort((a, b) => b.tokensBefore - a.tokensBefore),
    };
  }

  recent(limit = 50): RequestMetric[] {
    return this.buffer.slice(-limit).reverse();
  }

  clear(): void {
    this.buffer.length = 0;
    this.seq = 0;
  }

  /** Plain-data snapshot for persistence (pure; no I/O). */
  snapshot(): { records: RequestMetric[]; seq: number } {
    return { records: [...this.buffer], seq: this.seq };
  }

  /** Rehydrate from a snapshot, replacing current state. */
  restore(snap: { records: RequestMetric[]; seq: number }): void {
    this.buffer.length = 0;
    this.buffer.push(...snap.records.slice(-this.capacity));
    this.seq = snap.seq;
  }
}
