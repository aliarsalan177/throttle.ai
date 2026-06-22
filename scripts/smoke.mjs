// Runtime smoke test against the COMPILED dist (no socket bind):
// drives the built proxy via app.request() with an injected upstream fetch.
import { createServer } from "../packages/proxy/dist/server.js";

let captured = null;
const fetchImpl = async (url, init) => {
  captured = { url: String(url), body: JSON.parse(String(init.body)), headers: init.headers };
  // Echo an SSE stream back, like a real provider would.
  const sse =
    `event: message_start\ndata: ${JSON.stringify({ echo: captured.body.model })}\n\n` +
    "event: message_stop\ndata: {}\n\n";
  return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
};

const { app } = createServer({
  proxyConfig: {
    host: "127.0.0.1",
    port: 0,
    upstream: { anthropic: "http://up.test", openai: "http://up.test" },
    logRequests: true,
  },
  fetchImpl,
});

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const health = await (await app.request("/health")).json();
check("/health ok", health.ok === true, JSON.stringify(health.stages));

const reqBody = {
  model: "claude-opus-4-8",
  stream: true,
  max_tokens: 50,
  messages: [{ role: "user", content: "hi" }],
};
const res = await app.request("/v1/messages", {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": "shh-secret" },
  body: JSON.stringify(reqBody),
});
check("forward status 200", res.status === 200);
check("upstream URL = anthropic + path", captured.url === "http://up.test/v1/messages", captured.url);
check("model preserved through pipeline", captured.body.model === reqBody.model, captured.body.model);
check("SSE content-type preserved", res.headers.get("content-type") === "text/event-stream");
const text = await res.text();
check("SSE frames intact", text.includes("message_start") && text.includes("message_stop"));

// --- Dashboard API ---
const metrics = await (await app.request("/v1/metrics")).json();
check("metrics recorded the request", metrics.aggregate.requests === 1, JSON.stringify(metrics.aggregate));

const cfg = await (await app.request("/v1/config")).json();
check("lossless stages on by default", cfg.stages && cfg.stages.cache === true && cfg.stages.strip === true);

const patched = await (
  await app.request("/v1/config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stages: { dedup: true } }),
  })
).json();
check("config toggle persists", patched.stages.dedup === true);

const tok = await (
  await app.request("/v1/tokenize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "hello world", model: "gpt-4o" }),
  })
).json();
check("token calculator (exact BPE)", tok.tokens === 2 && tok.characters === 11 && tok.approximate === false, JSON.stringify(tok));

console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
