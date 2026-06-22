import { describe, it, expect } from "vitest";
import { createMcpServer, PLANNED_TOOLS } from "./server.js";

describe("createMcpServer (stub)", () => {
  it("exposes the planned context-store tool surface", () => {
    const s = createMcpServer();
    expect(s.tools).toBe(PLANNED_TOOLS);
    expect(s.tools.map((t) => t.name)).toEqual(["context.put", "context.get"]);
  });

  it("ships a working in-memory registry for context ids", () => {
    const s = createMcpServer();
    const id = s.registry.register("sess", "hash", 10);
    expect(s.registry.lookup("sess", "hash")).toBe(id);
  });

  it("every planned tool has a name and description", () => {
    for (const t of PLANNED_TOOLS) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});
