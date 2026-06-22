import { describe, it, expect } from "vitest";
import { runPipeline, createSessionContext } from "./pipeline.js";
import { approxTokenizer } from "./tokenizer.js";
import { InMemoryContextRegistry } from "./memory.js";
import { resolveConfig } from "./config.js";
import type { NormalizedRequest, Stage, TreConfig } from "./types.js";

function makeReq(text: string): NormalizedRequest {
  return {
    provider: "anthropic",
    model: "claude-opus-4-8",
    system: [{ type: "text", text: "you are helpful" }],
    messages: [{ role: "user", content: [{ type: "text", text }] }],
    tools: [],
    stream: false,
    params: {},
    raw: {},
  };
}

function ctxWith(config: TreConfig) {
  return createSessionContext({
    sessionId: "s1",
    config,
    tokenizer: approxTokenizer,
    registry: new InMemoryContextRegistry(),
  });
}

const allOff = () =>
  resolveConfig({
    stages: { cache: false, strip: false, dedup: false, filediff: false, slice: false, intent: false },
  });

describe("runPipeline", () => {
  it("is an exact passthrough when all stages are off", async () => {
    const req = makeReq("hello world this is a prompt");
    const out = await runPipeline(req, ctxWith(allOff()));
    expect(out.req).toBe(req);
    expect(out.metrics.saved).toBe(0);
    expect(out.metrics.tokensBefore).toBe(out.metrics.tokensAfter);
    expect(out.metrics.perStage).toHaveLength(0);
  });

  it("counts a non-zero baseline", async () => {
    const out = await runPipeline(makeReq("hello world"), ctxWith(resolveConfig()));
    expect(out.metrics.tokensBefore).toBeGreaterThan(0);
  });

  it("reverts a lossy stage whose savings fall below the threshold", async () => {
    const tinySaver: Stage = {
      name: "filediff", // a reversible:false stage
      enabled: true,
      run(req) {
        const msg = req.messages[0]!;
        const block = msg.content[0]!;
        const shortened = {
          ...req,
          messages: [
            { ...msg, content: [{ type: "text" as const, text: (block as { text: string }).text.slice(0, -4) }] },
          ],
        };
        return { req: shortened, saved: 1, reversible: false };
      },
    };
    const config = resolveConfig({ stages: { filediff: true } as never, minSavingsTokens: 1000 });
    const out = await runPipeline(makeReq("a".repeat(40)), ctxWith(config), {
      stages: [tinySaver],
    });
    // Guardrail reverts: output equals input, nothing saved.
    expect(out.metrics.saved).toBe(0);
    expect(out.metrics.perStage[0]?.notes).toContain("reverted");
  });

  it("skips a stage whose config toggle is off, even if stage.enabled is true", async () => {
    let ran = false;
    const eager: Stage = {
      name: "cache",
      enabled: true,
      run(req) {
        ran = true;
        return { req, saved: 0, reversible: true };
      },
    };
    // explicitly disable cache -> must not run even though stage.enabled is true
    const cfg = resolveConfig({ stages: { cache: false } as never });
    await runPipeline(makeReq("hi"), ctxWith(cfg), { stages: [eager] });
    expect(ran).toBe(false);
  });

  it("runs enabled stages in order and accumulates measured savings", async () => {
    const order: string[] = [];
    const drop = (name: "strip" | "cache", chars: number): Stage => ({
      name,
      enabled: true,
      run(req) {
        order.push(name);
        const sys = req.system[0]!;
        return {
          req: { ...req, system: [{ type: "text" as const, text: sys.text.slice(0, -chars) }] },
          saved: 0,
          reversible: true,
        };
      },
    });
    const config = resolveConfig({ stages: { cache: true, strip: true } as never });
    const out = await runPipeline(
      { ...makeReq("x"), system: [{ type: "text", text: "a".repeat(80) }] },
      ctxWith(config),
      { stages: [drop("cache", 40), drop("strip", 40)] },
    );
    expect(order).toEqual(["cache", "strip"]);
    expect(out.metrics.saved).toBeGreaterThan(0);
    expect(out.metrics.perStage).toHaveLength(2);
  });

  it("awaits async stages", async () => {
    const asyncStage: Stage = {
      name: "strip",
      enabled: true,
      async run(req) {
        await Promise.resolve();
        return { req, saved: 0, reversible: true, notes: "async-ran" };
      },
    };
    const config = resolveConfig({ stages: { strip: true } as never });
    const out = await runPipeline(makeReq("hi"), ctxWith(config), { stages: [asyncStage] });
    expect(out.metrics.perStage[0]?.notes).toBe("async-ran");
  });

  it("reports duration from the injected clock", async () => {
    let t = 1000;
    const out = await runPipeline(makeReq("hi"), ctxWith(resolveConfig()), {
      now: () => (t += 5),
    });
    expect(out.metrics.durationMs).toBe(5);
  });

  it("keeps a lossless stage even with tiny savings", async () => {
    const trim: Stage = {
      name: "strip", // reversible:true
      enabled: true,
      run(req) {
        const trimmed = {
          ...req,
          system: [{ type: "text" as const, text: req.system[0]!.text.trim() }],
        };
        return { req: trimmed, saved: 0, reversible: true, notes: "trimmed" };
      },
    };
    const config = resolveConfig({ stages: { strip: true } as never, minSavingsTokens: 1000 });
    const out = await runPipeline(makeReq("hi"), ctxWith(config), { stages: [trim] });
    // Lossless stage is kept (not reverted) even though it saved nothing.
    expect(out.metrics.perStage[0]?.name).toBe("strip");
    expect(out.metrics.perStage[0]?.notes).toBe("trimmed");
  });
});
