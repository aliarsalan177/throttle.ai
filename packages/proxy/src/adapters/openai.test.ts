import { describe, it, expect } from "vitest";
import { openaiAdapter } from "./openai.js";

const O = openaiAdapter;

describe("openaiAdapter.normalize", () => {
  it("keeps system prompts inline as role:system messages (no top-level system)", () => {
    const r = O.normalize({
      model: "m",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
    });
    expect(r.system).toEqual([]);
    expect(r.messages[0]).toEqual({ role: "system", content: [{ type: "text", text: "sys" }] });
  });

  it("normalizes array content parts, keeping non-text parts as raw", () => {
    const img = { type: "image_url", image_url: { url: "http://x" } };
    const r = O.normalize({
      model: "m",
      messages: [{ role: "user", content: [{ type: "text", text: "look" }, img] }],
    });
    expect(r.messages[0]!.content).toEqual([
      { type: "text", text: "look" },
      { type: "raw", raw: img },
    ]);
  });

  it("treats null content (tool-call message) as empty blocks", () => {
    const r = O.normalize({
      model: "m",
      messages: [{ role: "assistant", content: null, tool_calls: [{ id: "c1" }] }],
    });
    expect(r.messages[0]!.content).toEqual([]);
  });

  it("reads max_tokens, max_completion_tokens fallback, and stop", () => {
    expect(O.normalize({ model: "m", max_tokens: 10, messages: [] }).params.maxTokens).toBe(10);
    expect(
      O.normalize({ model: "m", max_completion_tokens: 20, messages: [] }).params.maxTokens,
    ).toBe(20);
    expect(O.normalize({ model: "m", stop: ["A", "B"], messages: [] }).params.stop).toEqual(["A", "B"]);
  });

  it("preserves the whole function object in the opaque tool schema", () => {
    const fn = { name: "f", description: "d", parameters: { type: "object" } };
    const r = O.normalize({ model: "m", tools: [{ type: "function", function: fn }], messages: [] });
    expect(r.tools[0]).toEqual({ name: "f", description: "d", schema: fn });
  });
});

describe("openaiAdapter denormalize / round-trip", () => {
  it("preserves tool_calls and tool_call_id by zipping against raw messages", () => {
    const body = {
      model: "m",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "c1", content: "result" },
      ],
    };
    const out = O.denormalize(O.normalize(body));
    const msgs = out.messages as Array<Record<string, unknown>>;
    expect(msgs[0]!.content).toBe("sys"); // string form preserved
    expect(msgs[2]!.tool_calls).toEqual(body.messages[2]!.tool_calls);
    expect(msgs[2]!.content).toBeNull(); // null content preserved, not coerced to []
    expect(msgs[3]!.tool_call_id).toBe("c1");
  });

  it("keeps multimodal array content as an array on the way out", () => {
    const img = { type: "image_url", image_url: { url: "http://x" } };
    const body = { model: "m", messages: [{ role: "user", content: [{ type: "text", text: "look" }, img] }] };
    const out = O.denormalize(O.normalize(body));
    const msgs = out.messages as Array<Record<string, unknown>>;
    expect(msgs[0]!.content).toEqual([{ type: "text", text: "look" }, img]);
  });

  it("rebuilds tools as {type:function, function}", () => {
    const fn = { name: "f", parameters: { type: "object" } };
    const out = O.denormalize(O.normalize({ model: "m", tools: [{ type: "function", function: fn }], messages: [] }));
    expect(out.tools).toEqual([{ type: "function", function: fn }]);
  });

  it("preserves unmodeled top-level fields (e.g. response_format) via raw", () => {
    const body = { model: "m", response_format: { type: "json_object" }, messages: [{ role: "user", content: "hi" }] };
    const out = O.denormalize(O.normalize(body));
    expect(out.response_format).toEqual({ type: "json_object" });
  });
});

describe("openaiAdapter robustness (malformed input)", () => {
  it("tolerates missing model/messages", () => {
    const r = O.normalize({});
    expect(r.model).toBe("");
    expect(r.messages).toEqual([]);
  });

  it("tolerates non-array messages and non-object entries", () => {
    expect(O.normalize({ messages: 5 }).messages).toEqual([]);
    const r = O.normalize({ messages: [null] });
    expect(r.messages[0]).toEqual({ role: "user", content: [] });
  });

  it("treats undefined content as empty blocks", () => {
    expect(O.normalize({ messages: [{ role: "assistant" }] }).messages[0]!.content).toEqual([]);
  });

  it("tolerates tools without a function object", () => {
    expect(O.normalize({ tools: [{ type: "function" }], messages: [] }).tools[0]).toEqual({
      name: "",
      description: undefined,
      schema: {},
    });
  });

  it("denormalize handles a request whose raw.messages is absent", () => {
    const norm = O.normalize({ model: "m", messages: [{ role: "user", content: "hi" }] });
    // Simulate a stage that rebuilt messages but lost the raw array.
    const stripped = { ...norm, raw: { model: "m" } };
    const out = O.denormalize(stripped);
    // No raw hint => can't know it was a string => emits the (equivalent) array form.
    expect((out.messages as Array<Record<string, unknown>>)[0]!.content).toEqual([
      { type: "text", text: "hi" },
    ]);
  });
});
