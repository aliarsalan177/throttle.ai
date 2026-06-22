import { describe, it, expect } from "vitest";
import { ApproxTokenizer, approxTokenizer } from "./tokenizer.js";
import type { NormalizedRequest } from "./types.js";

describe("ApproxTokenizer", () => {
  it("declares itself inexact so callers never treat it as billing-grade", () => {
    expect(new ApproxTokenizer().exact).toBe(false);
  });

  it("counts empty string as zero", () => {
    expect(approxTokenizer.count("", "any")).toBe(0);
  });

  it("scales roughly with length (~4 chars/token)", () => {
    expect(approxTokenizer.count("abcd", "m")).toBe(1);
    expect(approxTokenizer.count("a".repeat(40), "m")).toBe(10);
  });

  it("is model-agnostic for the approximation", () => {
    const s = "the quick brown fox";
    expect(approxTokenizer.count(s, "claude-opus-4-8")).toBe(approxTokenizer.count(s, "gpt-x"));
  });

  it("countRequest sums system, messages (all block kinds) and tools", () => {
    const req: NormalizedRequest = {
      provider: "anthropic",
      model: "m",
      system: [{ type: "text", text: "abcd" }], // 1
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "abcd" }, // 1
            { type: "tool_use", id: "1", name: "ab", input: { x: 1 } }, // "ab{\"x\":1}" = 9 -> 3
            { type: "tool_result", toolUseId: "1", content: "abcd" }, // 1
            { type: "raw", raw: { a: 1 } }, // "{\"a\":1}" = 7 -> 2
          ],
        },
      ],
      tools: [{ name: "abcd", description: "", schema: {} }], // "abcd{}" = 6 -> 2
      stream: false,
      params: {},
      raw: {},
    };
    // 1 + (1+3+1+2) + 2 = 10
    expect(approxTokenizer.countRequest(req)).toBe(10);
  });

  it("counts nested tool_result block content", () => {
    const req: NormalizedRequest = {
      provider: "anthropic",
      model: "m",
      system: [],
      messages: [
        {
          role: "user",
          content: [
            { type: "tool_result", toolUseId: "1", content: [{ type: "text", text: "abcdabcd" }] },
          ],
        },
      ],
      tools: [],
      stream: false,
      params: {},
      raw: {},
    };
    expect(approxTokenizer.countRequest(req)).toBe(2); // 8 chars -> 2 tokens
  });
});
