import { describe, it, expect } from "vitest";
import { defaultConfig, resolveConfig } from "./config.js";

describe("config", () => {
  it("defaults: lossless stages on (cache, strip), lossy stages off", () => {
    expect(defaultConfig.stages.cache).toBe(true);
    expect(defaultConfig.stages.strip).toBe(true);
    expect(defaultConfig.stages.dedup).toBe(false);
    expect(defaultConfig.stages.filediff).toBe(false);
    expect(defaultConfig.stages.slice).toBe(false);
    expect(defaultConfig.stages.intent).toBe(false);
  });

  it("resolveConfig() with no args equals the defaults", () => {
    expect(resolveConfig()).toEqual(defaultConfig);
  });

  it("merges a partial stage toggle without dropping the others", () => {
    const cfg = resolveConfig({ stages: { cache: true } as never });
    expect(cfg.stages.cache).toBe(true);
    expect(cfg.stages.dedup).toBe(false);
    expect(cfg.stages.intent).toBe(false);
  });

  it("overrides scalar fields", () => {
    const cfg = resolveConfig({ minSavingsTokens: 99, store: false });
    expect(cfg.minSavingsTokens).toBe(99);
    expect(cfg.store).toBe(false);
  });

  it("does not mutate the shared defaultConfig", () => {
    resolveConfig({ stages: { dedup: true } as never, minSavingsTokens: 1 });
    expect(defaultConfig.stages.dedup).toBe(false);
    expect(defaultConfig.minSavingsTokens).toBe(32);
  });
});
