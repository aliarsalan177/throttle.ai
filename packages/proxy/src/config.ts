import type { Provider } from "@tre/core";

/**
 * Proxy runtime config, sourced from environment variables.
 *
 * Security model: bind to 127.0.0.1 only, never log API
 * keys, no cloud egress except to the user's chosen provider upstream.
 */
export interface ProxyConfig {
  host: string;
  port: number;
  /** Upstream base URLs per provider (no trailing slash). */
  upstream: Record<Provider, string>;
  /** Verbose request logging (still redacts auth headers). */
  logRequests: boolean;
}

const DEFAULT_UPSTREAM: Record<Provider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ProxyConfig {
  return {
    host: env.TRE_HOST ?? "127.0.0.1",
    port: Number(env.TRE_PORT ?? "8787"),
    upstream: {
      anthropic: stripTrailingSlash(env.TRE_ANTHROPIC_UPSTREAM ?? DEFAULT_UPSTREAM.anthropic),
      openai: stripTrailingSlash(env.TRE_OPENAI_UPSTREAM ?? DEFAULT_UPSTREAM.openai),
    },
    logRequests: env.TRE_LOG_REQUESTS !== "false",
  };
}

/**
 * Headers we must NOT forward upstream (hop-by-hop or host-specific). Auth
 * headers ARE forwarded (the client owns its key) but never logged.
 */
export const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "accept-encoding",
]);

/** Header names whose values must be redacted in any log output. */
export const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-api-key",
  "openai-api-key",
  "anthropic-api-key",
]);
