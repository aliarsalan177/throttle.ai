import type { PipelineMetrics } from "./types.js";

/**
 * Metrics helpers. A later version persists these to SQLite and feeds the dashboard; for now
 * this is pure shaping/formatting so the proxy can log a baseline.
 *
 * Reminder: never report a token-reduction headline without
 * the accuracy number beside it. These helpers deliberately only summarize token
 * deltas — accuracy comes from the eval suite, not from here.
 */

export interface MetricsSummary {
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  savedPct: number;
  durationMs: number;
  stages: Array<{ name: string; saved: number; reversible: boolean }>;
}

export function summarize(metrics: PipelineMetrics): MetricsSummary {
  const savedPct =
    metrics.tokensBefore > 0 ? (metrics.saved / metrics.tokensBefore) * 100 : 0;
  return {
    tokensBefore: metrics.tokensBefore,
    tokensAfter: metrics.tokensAfter,
    saved: metrics.saved,
    savedPct: Math.round(savedPct * 10) / 10,
    durationMs: Math.round(metrics.durationMs * 100) / 100,
    stages: metrics.perStage.map((s) => ({
      name: s.name,
      saved: s.saved,
      reversible: s.reversible,
    })),
  };
}

/** One-line, human-readable log string for the proxy. */
export function formatLogLine(model: string, m: PipelineMetrics): string {
  const pct =
    m.tokensBefore > 0 ? ((m.saved / m.tokensBefore) * 100).toFixed(1) : "0.0";
  return `[tre] model=${model} before=${m.tokensBefore} after=${m.tokensAfter} saved=${m.saved} (${pct}%) ${m.durationMs.toFixed(1)}ms`;
}
