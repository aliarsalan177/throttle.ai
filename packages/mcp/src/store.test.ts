import { describe, it, expect } from "vitest";
import { ContextStore } from "./store.js";
import { buildContextTools } from "./tools.js";

describe("ContextStore", () => {
  it("stores content and returns a stable id", () => {
    const s = new ContextStore();
    const a = s.put("hello");
    expect(a.id).toMatch(/^ctx_/);
    expect(a.bytes).toBe(5);
    expect(s.get(a.id)).toBe("hello");
  });

  it("dedups identical content to the same id", () => {
    const s = new ContextStore();
    expect(s.put("same").id).toBe(s.put("same").id);
  });

  it("returns undefined for unknown ids", () => {
    expect(new ContextStore().get("ctx_nope")).toBeUndefined();
  });

  it("lists stored entries with labels", () => {
    const s = new ContextStore();
    s.put("x", "stack");
    expect(s.list()[0]).toMatchObject({ label: "stack", bytes: 1 });
  });
});

describe("context tools", () => {
  it("exposes context.put and context.get", () => {
    const tools = buildContextTools(new ContextStore());
    expect(tools.map((t) => t.name)).toEqual(["context.put", "context.get"]);
  });

  it("put stores and get round-trips through the handlers", () => {
    const store = new ContextStore();
    const [put, get] = buildContextTools(store);
    const putRes = put!.handler({ content: "big context block", label: "stack" });
    const { id } = JSON.parse(putRes.content[0]!.text);
    const getRes = get!.handler({ id });
    expect(getRes.content[0]!.text).toBe("big context block");
    expect(getRes.isError).toBeUndefined();
  });

  it("put errors when content is missing", () => {
    const [put] = buildContextTools(new ContextStore());
    const res = put!.handler({});
    expect(res.isError).toBe(true);
  });

  it("get errors on an unknown id", () => {
    const [, get] = buildContextTools(new ContextStore());
    const res = get!.handler({ id: "ctx_missing" });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("no context");
  });
});
