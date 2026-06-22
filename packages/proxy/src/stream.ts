import { HOP_BY_HOP_HEADERS, SENSITIVE_HEADERS } from "./config.js";

/**
 * Header plumbing for transparent forwarding.
 *
 * Streaming rule: SSE must pass through UNBUFFERED and we
 * only ever transform the *request*, never the streamed response. So the
 * forwarder returns the upstream `Response` with its body stream attached as-is.
 */

/** Headers to send upstream: copy the client's, minus hop-by-hop/host-specific. */
export function buildUpstreamHeaders(incoming: Headers): Headers {
  const out = new Headers();
  incoming.forEach((value, key) => {
    const k = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(k)) return;
    // Internal control headers (e.g. x-tre-session) are ours, not the provider's.
    if (k.startsWith("x-tre-")) return;
    out.set(key, value);
  });
  out.set("content-type", "application/json");
  // We re-serialize the (possibly transformed) body, so let fetch set length.
  // Disable upstream compression so SSE frames arrive uncompressed and unbuffered.
  out.set("accept-encoding", "identity");
  return out;
}

/** Headers to return to the client: copy upstream's, minus framing headers fetch will reset. */
export function buildClientHeaders(upstream: Headers): Headers {
  const out = new Headers();
  upstream.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "content-encoding" || k === "content-length" || k === "transfer-encoding") return;
    out.set(key, value);
  });
  return out;
}

/** Redact sensitive header values for logging. */
export function redactHeaders(h: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  h.forEach((value, key) => {
    obj[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? "***redacted***" : value;
  });
  return obj;
}
