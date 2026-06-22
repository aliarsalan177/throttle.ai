import { describe, it, expect } from "vitest";
import { InMemoryFileVersionStore } from "./fileStore.js";

describe("InMemoryFileVersionStore", () => {
  it("stores and retrieves content per (session, path)", () => {
    const s = new InMemoryFileVersionStore();
    expect(s.get("s1", "a.ts")).toBeUndefined();
    s.put("s1", "a.ts", "v1");
    expect(s.get("s1", "a.ts")).toBe("v1");
    s.put("s1", "a.ts", "v2");
    expect(s.get("s1", "a.ts")).toBe("v2");
  });

  it("isolates sessions and paths", () => {
    const s = new InMemoryFileVersionStore();
    s.put("s1", "a.ts", "x");
    expect(s.get("s2", "a.ts")).toBeUndefined();
    expect(s.get("s1", "b.ts")).toBeUndefined();
  });

  it("clears one session or all", () => {
    const s = new InMemoryFileVersionStore();
    s.put("s1", "a.ts", "x");
    s.put("s2", "a.ts", "y");
    s.clear("s1");
    expect(s.get("s1", "a.ts")).toBeUndefined();
    expect(s.get("s2", "a.ts")).toBe("y");
    s.clear();
    expect(s.get("s2", "a.ts")).toBeUndefined();
  });
});
