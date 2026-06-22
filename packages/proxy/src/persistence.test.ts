import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPersistence } from "./persistence.js";

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "tre-persist-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Wait out the debounce so the flush actually writes. */
const flushed = () => new Promise((r) => setTimeout(r, 1100));

describe("loadPersistence", () => {
  it("creates the data directory if missing", () => {
    const d = join(tempDir(), "nested", "data");
    loadPersistence(d);
    expect(existsSync(d)).toBe(true);
  });

  it("persists sessions + metrics and reloads them in a fresh instance", async () => {
    const d = tempDir();
    const p1 = loadPersistence(d, 5);
    p1.history.append("proj", {
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tokens: 12,
      at: 1000,
    });
    p1.metrics.record({
      at: 1000,
      provider: "anthropic",
      model: "claude-opus-4-8",
      sessionId: "proj",
      tokensBefore: 12,
      tokensAfter: 9,
      saved: 3,
      durationMs: 2,
    });
    p1.save();
    await new Promise((r) => setTimeout(r, 30));

    // Fresh instance reads from disk.
    const p2 = loadPersistence(d);
    expect(p2.history.resume("proj")?.totalTokens).toBe(12);
    expect(p2.metrics.aggregate().requests).toBe(1);
    expect(p2.metrics.aggregate().saved).toBe(3);
  });

  it("starts clean when the data files are absent", () => {
    const p = loadPersistence(tempDir());
    expect(p.history.list()).toEqual([]);
    expect(p.metrics.aggregate().requests).toBe(0);
  });

  it("survives a corrupt data file (starts fresh, doesn't throw)", async () => {
    const d = tempDir();
    const p1 = loadPersistence(d, 5);
    p1.history.append("x", { model: "m", messages: [], tokens: 1, at: 1 });
    p1.save();
    await flushed();
    // Corrupt one file, then reload.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(d, "metrics.json"), "{not json");
    const p2 = loadPersistence(d);
    expect(p2.history.resume("x")).toBeDefined(); // good file still loads
    expect(p2.metrics.aggregate().requests).toBe(0); // corrupt file → empty
  });
});
