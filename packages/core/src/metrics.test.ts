import { describe, it, expect } from "vitest";
import { summarize, formatLogLine } from "./metrics.js";
import type { PipelineMetrics } from "./types.js";

const base: PipelineMetrics = {
  tokensBefore: 200,
  tokensAfter: 150,
  saved: 50,
  perStage: [{ name: "cache", saved: 50, reversible: true, notes: "ok" }],
  durationMs: 12.345,
};

describe("summarize", () => {
  it("computes savedPct and rounds to 1dp", () => {
    const s = summarize(base);
    expect(s.savedPct).toBe(25);
    expect(s.saved).toBe(50);
  });

  it("guards against divide-by-zero when there were no input tokens", () => {
    const s = summarize({ ...base, tokensBefore: 0, tokensAfter: 0, saved: 0 });
    expect(s.savedPct).toBe(0);
    expect(Number.isFinite(s.savedPct)).toBe(true);
  });

  it("projects per-stage entries to name/saved/reversible only", () => {
    const s = summarize(base);
    expect(s.stages).toEqual([{ name: "cache", saved: 50, reversible: true }]);
  });

  it("rounds durationMs to 2dp", () => {
    expect(summarize(base).durationMs).toBe(12.35);
  });
});

describe("formatLogLine", () => {
  it("renders a single redaction-free line with model and deltas", () => {
    const line = formatLogLine("claude-opus-4-8", base);
    expect(line).toContain("model=claude-opus-4-8");
    expect(line).toContain("before=200");
    expect(line).toContain("after=150");
    expect(line).toContain("saved=50");
    expect(line).toContain("(25.0%)");
  });

  it("does not divide by zero on an empty request", () => {
    const line = formatLogLine("m", { ...base, tokensBefore: 0 });
    expect(line).toContain("(0.0%)");
  });
});
