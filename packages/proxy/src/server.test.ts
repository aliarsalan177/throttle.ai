import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { anthropicAdapter } from "./adapters/anthropic.js";
import { openaiAdapter } from "./adapters/openai.js";

const proxyConfig = {
  host: "127.0.0.1",
  port: 0,
  upstream: { anthropic: "https://up.anthropic.test", openai: "https://up.openai.test" },
  logRequests: false,
};

describe("proxy passthrough (M0)", () => {
  it("forwards the Anthropic body verbatim to the configured upstream", async () => {
    let seenUrl = "";
    let seenBody: unknown;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const { app } = createServer({ proxyConfig, fetchImpl });
    const reqBody = {
      model: "claude-opus-4-8",
      system: "be terse",
      max_tokens: 100,
      messages: [{ role: "user", content: "hello" }],
    };
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "secret" },
      body: JSON.stringify(reqBody),
    });

    expect(res.status).toBe(200);
    expect(seenUrl).toBe("https://up.anthropic.test/v1/messages");
    // M0: identical bytes forwarded (no stage enabled).
    expect(seenBody).toEqual(reqBody);
  });

  it("streams an SSE response through without buffering changes", async () => {
    const sse = "event: message_start\ndata: {}\n\nevent: message_stop\ndata: {}\n\n";
    const fetchImpl = (async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as unknown as typeof fetch;

    const { app } = createServer({ proxyConfig, fetchImpl });
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "hi" }] }),
    });

    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(sse);
  });

  it("routes OpenAI requests to the OpenAI upstream", async () => {
    let seenUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      seenUrl = String(url);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const { app } = createServer({ proxyConfig, fetchImpl });
    await app.request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-x", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(seenUrl).toBe("https://up.openai.test/v1/chat/completions");
  });

  it("returns 400 on non-JSON body", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch });
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 502 when the upstream is unreachable", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const { app } = createServer({ proxyConfig, fetchImpl });
    const res = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error.type).toBe("upstream_unreachable");
  });

  it("forwards the client API key upstream but never the internal session header", async () => {
    let seen: Headers | undefined;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const { app } = createServer({ proxyConfig, fetchImpl });
    await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "secret", "x-tre-session": "s1" },
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(seen?.get("x-api-key")).toBe("secret");
    expect(seen?.has("x-tre-session")).toBe(false);
  });

  it("never logs raw API keys", async () => {
    const logs: string[] = [];
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const { app } = createServer({
      proxyConfig: { ...proxyConfig, logRequests: true },
      fetchImpl,
      logger: (l) => logs.push(l),
    });
    await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "super-secret-key" },
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(logs.join("\n")).not.toContain("super-secret-key");
  });

  it("/health reports the active stage toggles", async () => {
    const { app } = createServer({ proxyConfig, fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch });
    const body = await (await app.request("/health")).json();
    expect(body.ok).toBe(true);
    expect(body.stages).toMatchObject({ cache: false, dedup: false });
  });
});

describe("adapter round-trip", () => {
  it("anthropic normalize→denormalize preserves a tool-using conversation", () => {
    const body = {
      model: "claude-opus-4-8",
      system: [{ type: "text", text: "sys" }],
      max_tokens: 50,
      tools: [{ name: "get_weather", description: "w", input_schema: { type: "object" } }],
      messages: [
        { role: "user", content: "weather?" },
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "get_weather", input: { city: "SF" } }],
        },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "t1", content: "sunny" }],
        },
      ],
    };
    const out = anthropicAdapter.denormalize(anthropicAdapter.normalize(body));
    expect(out.model).toBe(body.model);
    expect(out.tools).toEqual(body.tools);
    expect((out.messages as unknown[]).length).toBe(3);
  });

  it("openai normalize→denormalize preserves tool_calls on assistant messages", () => {
    const body = {
      model: "gpt-x",
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
    const out = openaiAdapter.denormalize(openaiAdapter.normalize(body));
    const msgs = out.messages as Array<Record<string, unknown>>;
    expect(msgs[2]!.tool_calls).toEqual(body.messages[2]!.tool_calls);
    expect(msgs[3]!.tool_call_id).toBe("c1");
    expect(msgs[0]!.content).toBe("sys");
  });
});
