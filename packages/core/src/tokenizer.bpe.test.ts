import { describe, it, expect } from "vitest";
import { BpeTokenizer, bpeTokenizer, isExactForModel } from "./tokenizer.js";
import type { NormalizedRequest } from "./types.js";

describe("BpeTokenizer", () => {
  it("counts empty string as zero", () => {
    expect(bpeTokenizer.count("", "gpt-4o")).toBe(0);
  });

  it("gives a real BPE count (not chars/4) for known text", () => {
    // "hello world" is 2 tokens under cl100k/o200k BPE.
    expect(bpeTokenizer.count("hello world", "gpt-4o")).toBe(2);
  });

  it("counts a full request across system, messages and tools", () => {
    const req: NormalizedRequest = {
      provider: "openai",
      model: "gpt-4o",
      system: [{ type: "text", text: "hello world" }],
      messages: [{ role: "user", content: [{ type: "text", text: "hello world" }] }],
      tools: [],
      stream: false,
      params: {},
      raw: {},
    };
    expect(bpeTokenizer.countRequest(req)).toBe(4); // 2 + 2
  });

  it("declares itself a real tokenizer", () => {
    expect(new BpeTokenizer().exact).toBe(true);
  });
});

describe("isExactForModel", () => {
  it("is exact for OpenAI-family models", () => {
    expect(isExactForModel("gpt-4o")).toBe(true);
    expect(isExactForModel("o3")).toBe(true);
    expect(isExactForModel("chatgpt-4o-latest")).toBe(true);
  });

  it("is approximate for non-OpenAI models", () => {
    expect(isExactForModel("claude-opus-4-8")).toBe(false);
    expect(isExactForModel("gemini-2.0")).toBe(false);
  });
});
