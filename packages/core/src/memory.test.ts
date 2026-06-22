import { describe, it, expect } from "vitest";
import { InMemoryContextRegistry } from "./memory.js";

describe("InMemoryContextRegistry", () => {
  it("returns undefined for an unseen hash", () => {
    const r = new InMemoryContextRegistry();
    expect(r.lookup("s1", "deadbeef")).toBeUndefined();
  });

  it("register returns a stable id for the same hash within a session", () => {
    const r = new InMemoryContextRegistry();
    const a = r.register("s1", "h1", 100);
    const b = r.register("s1", "h1", 100);
    expect(a).toBe(b);
    expect(r.lookup("s1", "h1")).toBe(a);
  });

  it("gives different hashes different ids", () => {
    const r = new InMemoryContextRegistry();
    expect(r.register("s1", "h1", 1)).not.toBe(r.register("s1", "h2", 1));
  });

  it("isolates ids per session (no cross-session leakage)", () => {
    const r = new InMemoryContextRegistry();
    r.register("s1", "h1", 1);
    expect(r.lookup("s2", "h1")).toBeUndefined();
  });

  it("clear() forgets everything", () => {
    const r = new InMemoryContextRegistry();
    r.register("s1", "h1", 1);
    r.clear();
    expect(r.lookup("s1", "h1")).toBeUndefined();
  });
});
