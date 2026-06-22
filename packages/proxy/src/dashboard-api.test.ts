import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";

const proxyConfig = {
  host: "127.0.0.1",
  port: 0,
  upstream: { anthropic: "https://up.anthropic.test", openai: "https://up.openai.test" },
  logRequests: false,
};

const ok = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

const sendChat = (app: { request: typeof fetch }, model = "claude-opus-4-8") =>
  app.request("/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hello there friend" }] }),
  });

describe("GET /v1/metrics", () => {
  it("starts empty", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const body = await (await app.request("/v1/metrics")).json();
    expect(body.aggregate.requests).toBe(0);
    expect(body.recent).toEqual([]);
  });

  it("records one entry per forwarded request with token deltas", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok, now: () => 1234 });
    await sendChat(app as never);
    await sendChat(app as never, "gpt-x");
    const body = await (await app.request("/v1/metrics")).json();
    expect(body.aggregate.requests).toBe(2);
    expect(body.recent).toHaveLength(2);
    expect(body.recent[0].model).toBe("gpt-x"); // newest first
    expect(body.recent[0].at).toBe(1234);
    expect(body.aggregate.byModel.map((m: { model: string }) => m.model).sort()).toEqual([
      "claude-opus-4-8",
      "gpt-x",
    ]);
  });

  it("honors the ?limit query", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    await sendChat(app as never);
    await sendChat(app as never);
    await sendChat(app as never);
    const body = await (await app.request("/v1/metrics?limit=1")).json();
    expect(body.recent).toHaveLength(1);
    expect(body.aggregate.requests).toBe(3);
  });
});

describe("GET/PATCH /v1/config", () => {
  it("returns current stage toggles", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const body = await (await app.request("/v1/config")).json();
    expect(body.stages.cache).toBe(true); // lossless, default on
    expect(body.stages.dedup).toBe(false); // lossy, default off
    expect(typeof body.minSavingsTokens).toBe("number");
  });

  it("toggles a stage at runtime and persists it for subsequent reads", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const patched = await (
      await app.request("/v1/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stages: { strip: true }, minSavingsTokens: 64 }),
      })
    ).json();
    expect(patched.stages.strip).toBe(true);
    expect(patched.minSavingsTokens).toBe(64);

    const reread = await (await app.request("/v1/config")).json();
    expect(reread.stages.strip).toBe(true);
  });

  it("ignores unknown stage keys and non-boolean values", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const res = await (
      await app.request("/v1/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stages: { nope: true, dedup: "yes" } }),
      })
    ).json();
    expect("nope" in res.stages).toBe(false);
    expect(res.stages.dedup).toBe(false); // non-boolean ignored, stays default
  });

  it("400s on invalid JSON", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const res = await app.request("/v1/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/tokenize (token calculator)", () => {
  it("counts tokens and characters for text (exact BPE for OpenAI)", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const body = await (
      await app.request("/v1/tokenize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hello world", model: "gpt-4o" }),
      })
    ).json();
    expect(body.characters).toBe(11);
    expect(body.tokens).toBe(2); // real BPE: "hello world" → 2 tokens
    expect(body.model).toBe("gpt-4o");
    expect(body.approximate).toBe(false); // exact for OpenAI models
  });

  it("flags non-OpenAI models as approximate", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const body = await (
      await app.request("/v1/tokenize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hi", model: "claude-opus-4-8" }),
      })
    ).json();
    expect(body.approximate).toBe(true);
  });

  it("treats empty/missing text as zero tokens", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const body = await (
      await app.request("/v1/tokenize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).json();
    expect(body.tokens).toBe(0);
    expect(body.model).toBe("generic");
  });
});

describe("CORS for dashboard", () => {
  it("allows a localhost origin on the metrics API", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const res = await app.request("/v1/metrics", { headers: { Origin: "http://localhost:5173" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("does not allow a non-localhost origin", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: ok });
    const res = await app.request("/v1/metrics", { headers: { Origin: "https://evil.example.com" } });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("https://evil.example.com");
  });
});
