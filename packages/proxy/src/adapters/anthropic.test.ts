import { describe, it, expect } from "vitest";
import { anthropicAdapter } from "./anthropic.js";

const A = anthropicAdapter;

describe("anthropicAdapter.normalize", () => {
  it("normalizes a string system prompt to one text block", () => {
    const r = A.normalize({ model: "m", system: "be terse", messages: [] });
    expect(r.system).toEqual([{ type: "text", text: "be terse" }]);
  });

  it("normalizes string message content to a text block", () => {
    const r = A.normalize({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(r.messages[0]!.content).toEqual([{ type: "text", text: "hi" }]);
  });

  it("captures cache_control on text blocks as a cache hint", () => {
    const r = A.normalize({
      model: "m",
      system: [{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }],
      messages: [],
    });
    expect(r.system[0]!.cacheControl).toEqual({ type: "ephemeral" });
  });

  it("preserves unknown block types as raw (lossless)", () => {
    const weird = { type: "image", source: { data: "..." } };
    const r = A.normalize({ model: "m", messages: [{ role: "user", content: [weird] }] });
    expect(r.messages[0]!.content[0]).toEqual({ type: "raw", raw: weird });
  });

  it("normalizes tool_use and tool_result blocks", () => {
    const r = A.normalize({
      model: "m",
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "f", input: { a: 1 } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: true }] },
      ],
    });
    expect(r.messages[0]!.content[0]).toEqual({ type: "tool_use", id: "t1", name: "f", input: { a: 1 } });
    expect(r.messages[1]!.content[0]).toEqual({
      type: "tool_result",
      toolUseId: "t1",
      content: "ok",
      isError: true,
    });
  });

  it("maps input_schema into the opaque tool schema and reads params", () => {
    const r = A.normalize({
      model: "m",
      max_tokens: 64,
      temperature: 0.2,
      top_p: 0.9,
      stop_sequences: ["X"],
      tools: [{ name: "f", description: "d", input_schema: { type: "object" } }],
      messages: [],
    });
    expect(r.tools[0]).toEqual({ name: "f", description: "d", schema: { type: "object" } });
    expect(r.params).toMatchObject({ maxTokens: 64, temperature: 0.2, topP: 0.9, stop: ["X"] });
  });
});

describe("anthropicAdapter denormalize / round-trip", () => {
  it("emits a string system when there is a single uncached block", () => {
    const out = A.denormalize(A.normalize({ model: "m", system: "sys", messages: [] }));
    expect(out.system).toBe("sys");
  });

  it("emits array system (with cache_control) when a block is cached", () => {
    const out = A.denormalize(
      A.normalize({
        model: "m",
        system: [{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }],
        messages: [],
      }),
    );
    expect(out.system).toEqual([{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
  });

  it("drops system entirely when empty", () => {
    const out = A.denormalize(A.normalize({ model: "m", messages: [] }));
    expect("system" in out).toBe(false);
  });

  it("round-trips a tool conversation to semantically equal JSON", () => {
    const body = {
      model: "claude-opus-4-8",
      max_tokens: 50,
      tools: [{ name: "f", description: "d", input_schema: { type: "object" } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "q" }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "f", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "r" }] },
      ],
    };
    const out = A.denormalize(A.normalize(body));
    expect(out.messages).toEqual(body.messages);
    expect(out.tools).toEqual(body.tools);
  });

  it("preserves unmodeled top-level fields via raw", () => {
    const out = A.denormalize(A.normalize({ model: "m", messages: [], metadata: { user_id: "u1" } }));
    expect(out.metadata).toEqual({ user_id: "u1" });
  });
});

describe("anthropicAdapter robustness (malformed input)", () => {
  it("tolerates a missing model and missing messages", () => {
    const r = A.normalize({});
    expect(r.model).toBe("");
    expect(r.messages).toEqual([]);
    expect(r.tools).toEqual([]);
  });

  it("tolerates non-array messages and non-object message entries", () => {
    expect(A.normalize({ messages: "nope" }).messages).toEqual([]);
    const r = A.normalize({ messages: [42, null] });
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]!.content).toEqual([]); // non-object -> empty content
  });

  it("defaults a message with no role to 'user'", () => {
    expect(A.normalize({ messages: [{ content: "hi" }] }).messages[0]!.role).toBe("user");
  });

  it("treats a non-object content block as raw", () => {
    const r = A.normalize({ messages: [{ role: "user", content: ["plain-string-block"] }] });
    expect(r.messages[0]!.content[0]).toEqual({ type: "raw", raw: "plain-string-block" });
  });

  it("ignores a non-string/non-array system field", () => {
    expect(A.normalize({ model: "m", system: 123, messages: [] }).system).toEqual([]);
  });

  it("tolerates tools that are not arrays or lack names", () => {
    expect(A.normalize({ tools: "nope", messages: [] }).tools).toEqual([]);
    expect(A.normalize({ tools: [{}], messages: [] }).tools[0]).toEqual({
      name: "",
      description: undefined,
      schema: {},
    });
  });
});
