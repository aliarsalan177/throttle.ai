import { Hono } from "hono";
import {
  approxTokenizer,
  createSessionContext,
  formatLogLine,
  InMemoryContextRegistry,
  InMemoryHistoryStore,
  resolveConfig,
  runPipeline,
  type SessionHistoryStore,
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
  /** Session history store; defaults to a process-wide in-memory store. */
  history?: SessionHistoryStore;
  /** Injectable clock for deterministic history timestamps; defaults to Date.now. */
  now?: () => number;
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
  const now = deps.now ?? (() => Date.now());

  // One registry + history store process-wide; both keyed by session id.
  const registry = new InMemoryContextRegistry();
  const history = deps.history ?? new InMemoryHistoryStore();

  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, name: "tre-proxy", stages: treConfig.stages }));

  // --- Session continuity: list / resume / purge saved conversations ---
  app.get("/v1/sessions", (c) => c.json({ sessions: history.list() }));

  app.get("/v1/sessions/:id", (c) => {
    const checkpoint = history.resume(c.req.param("id"));
    if (!checkpoint) {
      return c.json({ error: { type: "not_found", message: "no such session" } }, 404);
    }
    return c.json(checkpoint);
  });

  app.delete("/v1/sessions/:id", (c) => {
    history.clear(c.req.param("id"));
    return c.json({ ok: true });
  });

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

      // Persist this turn so the session can be resumed later (off in --no-store).
      // We snapshot the conversation as the user sent it, not the reduced form.
      if (treConfig.store) {
        history.append(ctx.sessionId, {
          model: normalized.model,
          messages: normalized.messages,
          tokens: metrics.tokensBefore,
          at: now(),
        });
      }

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

  return { app, proxyConfig, history };
}
