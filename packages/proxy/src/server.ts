import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  bpeTokenizer,
  createSessionContext,
  formatLogLine,
  InMemoryContextRegistry,
  InMemoryFileVersionStore,
  InMemoryHistoryStore,
  InMemoryMetricsStore,
  isExactForModel,
  resolveConfig,
  runPipeline,
  type MetricsStore,
  type SessionHistoryStore,
  type StageToggles,
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
  /** Per-request metrics store feeding the dashboard. */
  metrics?: MetricsStore;
  /** Called after each request so an optional persistence layer can flush. */
  onActivity?: () => void;
  /** Injectable clock for deterministic timestamps; defaults to Date.now. */
  now?: () => number;
}

/** Only localhost origins may call the management/dashboard API. */
const isLocalOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

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
  const onActivity = deps.onActivity ?? (() => {});

  // Process-wide stores, all keyed by session id where relevant.
  const registry = new InMemoryContextRegistry();
  const files = new InMemoryFileVersionStore();
  const history = deps.history ?? new InMemoryHistoryStore();
  const metrics = deps.metrics ?? new InMemoryMetricsStore();

  const app = new Hono();

  // The dashboard (served from another localhost port in dev) reads these APIs.
  app.use("/v1/metrics", cors({ origin: (o) => (isLocalOrigin(o) ? o : null) }));
  app.use("/v1/config", cors({ origin: (o) => (isLocalOrigin(o) ? o : null) }));
  app.use("/v1/tokenize", cors({ origin: (o) => (isLocalOrigin(o) ? o : null) }));
  app.use("/v1/sessions", cors({ origin: (o) => (isLocalOrigin(o) ? o : null) }));
  app.use("/v1/sessions/*", cors({ origin: (o) => (isLocalOrigin(o) ? o : null) }));

  app.get("/health", (c) => c.json({ ok: true, name: "tre-proxy", stages: treConfig.stages }));

  // --- Live config: read + toggle pipeline stages and thresholds at runtime ---
  app.get("/v1/config", (c) =>
    c.json({ stages: treConfig.stages, minSavingsTokens: treConfig.minSavingsTokens, store: treConfig.store }),
  );

  app.patch("/v1/config", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { type: "invalid_request", message: "body is not valid JSON" } }, 400);
    }
    if (body.stages && typeof body.stages === "object") {
      for (const [key, value] of Object.entries(body.stages as Record<string, unknown>)) {
        if (key in treConfig.stages && typeof value === "boolean") {
          treConfig.stages[key as keyof StageToggles] = value;
        }
      }
    }
    if (typeof body.minSavingsTokens === "number") treConfig.minSavingsTokens = body.minSavingsTokens;
    if (typeof body.store === "boolean") treConfig.store = body.store;
    return c.json({ stages: treConfig.stages, minSavingsTokens: treConfig.minSavingsTokens, store: treConfig.store });
  });

  // --- Metrics: aggregate savings + recent requests for the dashboard ---
  app.get("/v1/metrics", (c) => {
    const limit = Number(c.req.query("limit") ?? "50");
    return c.json({ aggregate: metrics.aggregate(), recent: metrics.recent(limit) });
  });

  // --- Token calculator: count tokens for arbitrary text under a model ---
  app.post("/v1/tokenize", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { type: "invalid_request", message: "body is not valid JSON" } }, 400);
    }
    const text = typeof body.text === "string" ? body.text : "";
    const model = typeof body.model === "string" ? body.model : "generic";
    const tokens = bpeTokenizer.count(text, model);
    return c.json({
      model,
      tokens,
      characters: text.length,
      // Exact BPE for OpenAI models; a close estimate for other providers.
      approximate: !isExactForModel(model),
    });
  });

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

      // --- Reduction pipeline (default: all stages off => exact passthrough) ---
      const normalized = adapter.normalize(body);
      const ctx = createSessionContext({
        sessionId: c.req.header("x-tre-session") ?? "default",
        config: treConfig,
        tokenizer: bpeTokenizer,
        registry,
        // File diffing keeps prior file versions; gate it behind --no-store too.
        files: treConfig.store ? files : undefined,
      });
      const { req: optimized, metrics: runMetrics } = await runPipeline(normalized, ctx);
      if (proxyConfig.logRequests) log(formatLogLine(optimized.model, runMetrics));

      // Record for the dashboard (always — these are aggregates, not prompt bodies).
      metrics.record({
        at: now(),
        provider: adapter.provider,
        model: normalized.model,
        sessionId: ctx.sessionId,
        tokensBefore: runMetrics.tokensBefore,
        tokensAfter: runMetrics.tokensAfter,
        saved: runMetrics.saved,
        durationMs: runMetrics.durationMs,
      });

      // Persist this turn so the session can be resumed later (off in --no-store).
      // We snapshot the conversation as the user sent it, not the reduced form.
      if (treConfig.store) {
        history.append(ctx.sessionId, {
          model: normalized.model,
          messages: normalized.messages,
          tokens: runMetrics.tokensBefore,
          at: now(),
        });
      }
      onActivity(); // let an optional persistence layer flush to disk

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

  return { app, proxyConfig, history, metrics };
}
