import { Hono } from "hono";
import {
  approxTokenizer,
  createSessionContext,
  formatLogLine,
  InMemoryContextRegistry,
  resolveConfig,
  runPipeline,
  type TreConfig,
} from "@tre/core";
import { anthropicAdapter } from "./adapters/anthropic.js";
import { openaiAdapter } from "./adapters/openai.js";
import type { Adapter } from "./adapters/types.js";
import { loadConfig, type ProxyConfig } from "./config.js";
import { buildClientHeaders, buildUpstreamHeaders } from "./stream.js";

export interface ServerDeps {
  proxyConfig?: ProxyConfig;
  treConfig?: Partial<TreConfig>;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  logger?: (line: string) => void;
}

/**
 * Build the proxy Hono app. Pure construction — no port is bound here so tests
 * can call `app.request(...)` directly.
 */
export function createServer(deps: ServerDeps = {}) {
  const proxyConfig = deps.proxyConfig ?? loadConfig();
  const treConfig = resolveConfig(deps.treConfig);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.logger ?? ((line: string) => console.log(line));

  // One registry process-wide; keyed internally by session id.
  const registry = new InMemoryContextRegistry();

  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, name: "tre-proxy", stages: treConfig.stages }));

  const handle = (adapter: Adapter) =>
    app.post(adapter.path, async (c) => {
      let body: Record<string, unknown>;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: { type: "invalid_request", message: "body is not valid JSON" } }, 400);
      }

      // --- Reduction pipeline (M0: all stages off => exact passthrough) ---
      const normalized = adapter.normalize(body);
      const ctx = createSessionContext({
        sessionId: c.req.header("x-tre-session") ?? "default",
        config: treConfig,
        tokenizer: approxTokenizer,
        registry,
      });
      const { req: optimized, metrics } = await runPipeline(normalized, ctx);
      if (proxyConfig.logRequests) log(formatLogLine(optimized.model, metrics));

      // If no stage touched the request, forward the original bytes verbatim.
      const outboundBody = optimized === normalized ? body : adapter.denormalize(optimized);

      // --- Transparent forward (request only; response streams through) ---
      const upstreamUrl = proxyConfig.upstream[adapter.provider] + adapter.path;
      let upstream: Response;
      try {
        upstream = await fetchImpl(upstreamUrl, {
          method: "POST",
          headers: buildUpstreamHeaders(new Headers(c.req.raw.headers)),
          body: JSON.stringify(outboundBody),
        });
      } catch (err) {
        return c.json(
          { error: { type: "upstream_unreachable", message: String((err as Error).message) } },
          502,
        );
      }

      // Pass the upstream response (incl. SSE stream) straight back, unbuffered.
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: buildClientHeaders(upstream.headers),
      });
    });

  handle(anthropicAdapter);
  handle(openaiAdapter);

  return { app, proxyConfig };
}
