import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  InMemoryHistoryStore,
  InMemoryMetricsStore,
  type RequestMetric,
  type SessionState,
} from "@tre/core";

/**
 * Opt-in disk persistence for sessions + metrics so they survive a proxy
 * restart. Enabled by setting a data directory; off by default (in-memory only).
 *
 * Local-first: writes plain JSON to the user's chosen directory and nowhere
 * else. Sessions hold the user's own prompts, so persistence is gated by the
 * same store/--no-store setting as the in-memory history.
 */
export interface Persistence {
  history: InMemoryHistoryStore;
  metrics: InMemoryMetricsStore;
  /** Debounced flush of both stores to disk. Safe to call after every request. */
  save(): void;
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined; // missing or corrupt → start fresh
  }
}

export function loadPersistence(dataDir: string, debounceMs = 1000): Persistence {
  mkdirSync(dataDir, { recursive: true });
  const historyPath = join(dataDir, "sessions.json");
  const metricsPath = join(dataDir, "metrics.json");

  const history = new InMemoryHistoryStore();
  const metrics = new InMemoryMetricsStore();

  const histSnap = readJson<SessionState[]>(historyPath);
  if (Array.isArray(histSnap)) history.restore(histSnap);
  const metSnap = readJson<{ records: RequestMetric[]; seq: number }>(metricsPath);
  if (metSnap && Array.isArray(metSnap.records)) metrics.restore(metSnap);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    try {
      writeFileSync(historyPath, JSON.stringify(history.snapshot()));
      writeFileSync(metricsPath, JSON.stringify(metrics.snapshot()));
    } catch {
      // Persistence is best-effort; never break a request because a write failed.
    }
  };

  return {
    history,
    metrics,
    save() {
      if (timer) return;
      timer = setTimeout(flush, debounceMs);
      // Don't keep the process alive just for a pending flush.
      if (typeof timer.unref === "function") timer.unref();
    },
  };
}
