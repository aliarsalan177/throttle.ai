import { describe, it, expect } from "vitest";
import { stripStage } from "./strip.js";
import { cacheStage } from "./cache.js";
import { dedupStage } from "./dedup.js";
import { filediffStage } from "./filediff.js";
import { bpeTokenizer } from "../tokenizer.js";
import { InMemoryContextRegistry } from "../memory.js";
import { InMemoryFileVersionStore } from "../fileStore.js";
import { resolveConfig } from "../config.js";
import type { NormalizedRequest, SessionContext, TextBlock } from "../types.js";

function baseCtx(over: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "s1",
    config: resolveConfig(),
    tokenizer: bpeTokenizer,
    registry: new InMemoryContextRegistry(),
    ...over,
  };
}

function req(partial: Partial<NormalizedRequest> = {}): NormalizedRequest {
  return {
    provider: "anthropic",
    model: "claude-opus-4-8",
    system: [],
    messages: [],
    tools: [],
    stream: false,
    params: {},
    raw: {},
    ...partial,
  };
}

const text = (t: string): TextBlock => ({ type: "text", text: t });

describe("strip stage", () => {
  it("trims trailing whitespace and collapses 3+ blank lines", () => {
    const out = stripStage.run(
      req({ messages: [{ role: "user", content: [text("line  \n\n\n\nmore   ")] }] }),
      baseCtx(),
    );
    const t = (out.req.messages[0]!.content[0] as TextBlock).text;
    expect(t).toBe("line\n\nmore");
  });

  it("drops empty text blocks and exact-duplicate boilerplate", () => {
    const out = stripStage.run(
      req({
        messages: [
          { role: "user", content: [text("HEADER"), text("   "), text("HEADER"), text("unique")] },
        ],
      }),
      baseCtx(),
    );
    const texts = out.req.messages[0]!.content.map((b) => (b as TextBlock).text);
    expect(texts).toEqual(["HEADER", "unique"]);
  });

  it("dedupes identical system blocks", () => {
    const out = stripStage.run(req({ system: [text("sys"), text("sys")] }), baseCtx());
    expect(out.req.system).toHaveLength(1);
  });

  it("is reversible (lossless) and leaves non-text blocks alone", () => {
    const out = stripStage.run(
      req({ messages: [{ role: "user", content: [{ type: "tool_use", id: "1", name: "f", input: {} }] }] }),
      baseCtx(),
    );
    expect(out.reversible).toBe(true);
    expect(out.req.messages[0]!.content[0]!.type).toBe("tool_use");
  });
});

describe("cache stage", () => {
  it("marks the final Anthropic system block with cache_control", () => {
    const out = cacheStage.run(req({ system: [text("a"), text("b")] }), baseCtx());
    expect(out.req.system[0]!.cacheControl).toBeUndefined();
    expect(out.req.system[1]!.cacheControl).toEqual({ type: "ephemeral" });
    expect(out.reversible).toBe(true);
  });

  it("is a no-op for OpenAI (automatic prefix caching)", () => {
    const r = req({ provider: "openai", system: [text("a")] });
    const out = cacheStage.run(r, baseCtx());
    expect(out.req).toBe(r);
  });

  it("is idempotent when a marker already exists", () => {
    const r = req({ system: [{ type: "text", text: "a", cacheControl: { type: "ephemeral" } }] });
    expect(cacheStage.run(r, baseCtx()).req).toBe(r);
  });

  it("does not change token count (cost-only win)", () => {
    const r = req({ system: [text("hello world this is the system prompt")] });
    const before = bpeTokenizer.countRequest(r);
    const out = cacheStage.run(r, baseCtx());
    expect(bpeTokenizer.countRequest(out.req)).toBe(before);
  });
});

describe("dedup stage", () => {
  const big = "X".repeat(300);

  it("collapses a later exact duplicate, keeping the first copy in full", () => {
    const out = dedupStage.run(
      req({
        messages: [
          { role: "user", content: [text(big)] },
          { role: "assistant", content: [text("ok")] },
          { role: "user", content: [text(big)] },
        ],
      }),
      baseCtx(),
    );
    expect((out.req.messages[0]!.content[0] as TextBlock).text).toBe(big); // first kept
    expect((out.req.messages[2]!.content[0] as TextBlock).text).toContain("omitted"); // second collapsed
    expect(out.reversible).toBe(false);
  });

  it("ignores short repeats below the length threshold", () => {
    const out = dedupStage.run(
      req({ messages: [{ role: "user", content: [text("short"), text("short")] }] }),
      baseCtx(),
    );
    expect((out.req.messages[0]!.content[1] as TextBlock).text).toBe("short");
  });
});

describe("filediff stage", () => {
  // A realistically-sized file: one changed line buried in many unchanged ones,
  // so a unified diff is much smaller than re-sending the whole thing.
  const lines = (marker: string) =>
    "src/app.ts\n" + Array.from({ length: 80 }, (_, i) => (i === 40 ? marker : `const x${i} = ${i};`)).join("\n");
  const v1 = lines("const target = 1;");
  const v2 = lines("const target = 2;");

  it("replaces a re-sent changed file with a unified diff", () => {
    const files = new InMemoryFileVersionStore();
    const ctx = baseCtx({ files });
    // First turn stores v1.
    filediffStage.run(req({ messages: [{ role: "user", content: [text(v1)] }] }), ctx);
    // Second turn sends v2 -> should become a diff.
    const out = filediffStage.run(req({ messages: [{ role: "user", content: [text(v2)] }] }), ctx);
    const t = (out.req.messages[0]!.content[0] as TextBlock).text;
    expect(t).toContain("sent as a diff");
    expect(t).toContain("const target = 2;");
    expect(t.length).toBeLessThan(v2.length); // diff genuinely smaller than the file
  });

  it("leaves an unchanged re-send alone (dedup's job)", () => {
    const files = new InMemoryFileVersionStore();
    const ctx = baseCtx({ files });
    filediffStage.run(req({ messages: [{ role: "user", content: [text(v1)] }] }), ctx);
    const out = filediffStage.run(req({ messages: [{ role: "user", content: [text(v1)] }] }), ctx);
    expect((out.req.messages[0]!.content[0] as TextBlock).text).toBe(v1);
  });

  it("is a safe no-op without a file store", () => {
    const r = req({ messages: [{ role: "user", content: [text(v1)] }] });
    const out = filediffStage.run(r, baseCtx());
    expect(out.req).toBe(r);
    expect(out.notes).toContain("no file store");
  });
});
