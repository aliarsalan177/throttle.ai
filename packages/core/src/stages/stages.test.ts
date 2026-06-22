import { describe, it, expect } from "vitest";
import { orderedStages, toggleKeyFor } from "./index.js";
import { approxTokenizer } from "../tokenizer.js";
import { InMemoryContextRegistry } from "../memory.js";
import { resolveConfig } from "../config.js";
import type { NormalizedRequest, SessionContext } from "../types.js";

function req(): NormalizedRequest {
  return {
    provider: "anthropic",
    model: "m",
    system: [{ type: "text", text: "sys" }],
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    tools: [],
    stream: false,
    params: {},
    raw: {},
  };
}

const ctx: SessionContext = {
  sessionId: "s",
  config: resolveConfig(),
  tokenizer: approxTokenizer,
  registry: new InMemoryContextRegistry(),
};

describe("stage registry", () => {
  it("orders stages conservative → aggressive", () => {
    expect(orderedStages.map((s) => s.name)).toEqual([
      "cache",
      "dedup",
      "strip",
      "filediff",
      "slice",
      "intent",
    ]);
  });

  it("every stage has a matching toggle key", () => {
    for (const s of orderedStages) expect(toggleKeyFor(s.name)).toBeDefined();
  });

  it("toggleKeyFor returns undefined for unknown names", () => {
    expect(toggleKeyFor("nope")).toBeUndefined();
  });

  it("all stages ship disabled by default", () => {
    expect(orderedStages.every((s) => s.enabled === false)).toBe(true);
  });

  it("every stub is a no-op that returns the request unchanged", async () => {
    const input = req();
    for (const s of orderedStages) {
      const out = await s.run(input, ctx);
      expect(out.req).toBe(input);
      expect(out.saved).toBe(0);
    }
  });

  it("tags reversibility honestly: lossy stages are not reversible", async () => {
    const byName = Object.fromEntries(orderedStages.map((s) => [s.name, s]));
    const reversibility = async (name: string) => (await byName[name]!.run(req(), ctx)).reversible;
    expect(await reversibility("cache")).toBe(true);
    expect(await reversibility("dedup")).toBe(true);
    expect(await reversibility("strip")).toBe(true);
    expect(await reversibility("filediff")).toBe(false);
    expect(await reversibility("slice")).toBe(false);
    expect(await reversibility("intent")).toBe(false);
  });
});
