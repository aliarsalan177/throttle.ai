import { describe, it, expect } from "vitest";
import { InMemoryMetricsStore } from "./metricsStore.js";
import type { RequestMetric } from "./metricsStore.js";

const rec = (over: Partial<Omit<RequestMetric, "id">> = {}): Omit<RequestMetric, "id"> => ({
  at: 1000,
  provider: "anthropic",
  model: "claude-opus-4-8",
  sessionId: "s1",
  tokensBefore: 100,
  tokensAfter: 60,
  saved: 40,
  durationMs: 5,
  ...over,
});

describe("InMemoryMetricsStore", () => {
  it("starts empty with a zeroed aggregate", () => {
    const agg = new InMemoryMetricsStore().aggregate();
    expect(agg.requests).toBe(0);
    expect(agg.savedPct).toBe(0);
    expect(agg.byModel).toEqual([]);
  });

  it("assigns incrementing ids", () => {
    const s = new InMemoryMetricsStore();
    expect(s.record(rec()).id).toBe(0);
    expect(s.record(rec()).id).toBe(1);
  });

  it("aggregates totals, percentage and average duration", () => {
    const s = new InMemoryMetricsStore();
    s.record(rec({ tokensBefore: 100, tokensAfter: 60, saved: 40, durationMs: 4 }));
    s.record(rec({ tokensBefore: 100, tokensAfter: 80, saved: 20, durationMs: 6 }));
    const a = s.aggregate();
    expect(a.requests).toBe(2);
    expect(a.tokensBefore).toBe(200);
    expect(a.saved).toBe(60);
    expect(a.savedPct).toBe(30); // 60/200
    expect(a.avgDurationMs).toBe(5);
  });

  it("breaks savings down by model, biggest first", () => {
    const s = new InMemoryMetricsStore();
    s.record(rec({ model: "claude-opus-4-8", tokensBefore: 50, saved: 10 }));
    s.record(rec({ model: "gpt-x", tokensBefore: 300, saved: 100 }));
    const a = s.aggregate();
    expect(a.byModel.map((m) => m.model)).toEqual(["gpt-x", "claude-opus-4-8"]);
    expect(a.byModel[0]!.requests).toBe(1);
    expect(a.byModel[0]!.saved).toBe(100);
  });

  it("returns recent records newest-first, capped by limit", () => {
    const s = new InMemoryMetricsStore();
    for (let i = 0; i < 5; i++) s.record(rec({ at: i }));
    const r = s.recent(2);
    expect(r).toHaveLength(2);
    expect(r[0]!.at).toBe(4); // newest first
    expect(r[1]!.at).toBe(3);
  });

  it("evicts oldest beyond capacity but still counts via the buffer", () => {
    const s = new InMemoryMetricsStore(3);
    for (let i = 0; i < 5; i++) s.record(rec({ at: i, saved: 1, tokensBefore: 1 }));
    const a = s.aggregate();
    expect(a.requests).toBe(3); // only last 3 retained
    expect(s.recent()[0]!.at).toBe(4);
  });

  it("clear() resets buffer and ids", () => {
    const s = new InMemoryMetricsStore();
    s.record(rec());
    s.clear();
    expect(s.aggregate().requests).toBe(0);
    expect(s.record(rec()).id).toBe(0);
  });
});
