import { describe, it, expect } from "vitest";
import { InMemoryHistoryStore } from "./history.js";
import type { NormalizedMessage } from "./types.js";

const msg = (text: string): NormalizedMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

describe("InMemoryHistoryStore", () => {
  it("returns undefined when resuming an unknown session", () => {
    expect(new InMemoryHistoryStore().resume("nope")).toBeUndefined();
  });

  it("records a turn and exposes a resumable checkpoint", () => {
    const h = new InMemoryHistoryStore();
    h.append("s1", { model: "claude-opus-4-8", messages: [msg("hello")], tokens: 10, at: 1000 });
    const cp = h.resume("s1")!;
    expect(cp.sessionId).toBe("s1");
    expect(cp.model).toBe("claude-opus-4-8");
    expect(cp.turns).toBe(1);
    expect(cp.messages).toEqual([msg("hello")]);
    expect(cp.totalTokens).toBe(10);
    expect(cp.firstSeen).toBe(1000);
    expect(cp.lastActive).toBe(1000);
  });

  it("keeps the LATEST conversation as the resume point and accumulates totals", () => {
    const h = new InMemoryHistoryStore();
    h.append("s1", { model: "m", messages: [msg("turn 1")], tokens: 5, at: 1000 });
    h.append("s1", { model: "m", messages: [msg("turn 1"), msg("turn 2")], tokens: 8, at: 2000 });
    const cp = h.resume("s1")!;
    expect(cp.turns).toBe(2);
    expect(cp.messages).toHaveLength(2); // resume from the fullest snapshot
    expect(cp.totalTokens).toBe(13);
    expect(cp.lastActive).toBe(2000);
    expect(cp.firstSeen).toBe(1000); // unchanged across turns
    expect(cp.timeline.map((t) => t.index)).toEqual([0, 1]);
  });

  it("lists sessions most-recently-active first", () => {
    const h = new InMemoryHistoryStore();
    h.append("old", { model: "m", messages: [msg("a")], tokens: 1, at: 1000 });
    h.append("new", { model: "m", messages: [msg("b")], tokens: 1, at: 5000 });
    expect(h.list().map((s) => s.sessionId)).toEqual(["new", "old"]);
  });

  it("isolates sessions from each other", () => {
    const h = new InMemoryHistoryStore();
    h.append("s1", { model: "m", messages: [msg("a")], tokens: 1, at: 1 });
    h.append("s2", { model: "m", messages: [msg("b")], tokens: 1, at: 2 });
    expect(h.resume("s1")!.messages).toEqual([msg("a")]);
    expect(h.resume("s2")!.messages).toEqual([msg("b")]);
  });

  it("clears one session, or all", () => {
    const h = new InMemoryHistoryStore();
    h.append("s1", { model: "m", messages: [msg("a")], tokens: 1, at: 1 });
    h.append("s2", { model: "m", messages: [msg("b")], tokens: 1, at: 2 });
    h.clear("s1");
    expect(h.resume("s1")).toBeUndefined();
    expect(h.resume("s2")).toBeDefined();
    h.clear();
    expect(h.list()).toEqual([]);
  });

  it("bounds the timeline when a cap is set (snapshot still latest)", () => {
    const h = new InMemoryHistoryStore(2);
    for (let i = 1; i <= 4; i++) {
      h.append("s1", { model: "m", messages: [msg(`t${i}`)], tokens: 1, at: i });
    }
    const cp = h.resume("s1")!;
    expect(cp.timeline).toHaveLength(2); // only the last 2 records kept
    expect(cp.timeline.map((t) => t.at)).toEqual([3, 4]);
    expect(cp.messages).toEqual([msg("t4")]); // newest snapshot preserved
    expect(cp.totalTokens).toBe(4); // totals still count every turn
  });

  it("resume returns a copy of the timeline (no external mutation)", () => {
    const h = new InMemoryHistoryStore();
    h.append("s1", { model: "m", messages: [msg("a")], tokens: 1, at: 1 });
    h.resume("s1")!.timeline.push({ index: 99, model: "x", tokens: 0, at: 0 });
    expect(h.resume("s1")!.timeline).toHaveLength(1);
  });
});
