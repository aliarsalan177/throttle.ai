import { describe, it, expect } from "vitest";
import { buildUpstreamHeaders, buildClientHeaders, redactHeaders } from "./stream.js";

describe("buildUpstreamHeaders", () => {
  it("forwards client auth but strips hop-by-hop headers", () => {
    const h = new Headers({
      "x-api-key": "secret",
      authorization: "Bearer t",
      host: "localhost:8787",
      "content-length": "100",
      connection: "keep-alive",
      "accept-encoding": "gzip",
    });
    const out = buildUpstreamHeaders(h);
    expect(out.get("x-api-key")).toBe("secret");
    expect(out.get("authorization")).toBe("Bearer t");
    expect(out.has("host")).toBe(false);
    expect(out.has("content-length")).toBe(false);
    expect(out.has("connection")).toBe(false);
  });

  it("forces identity encoding so SSE arrives unbuffered", () => {
    expect(buildUpstreamHeaders(new Headers()).get("accept-encoding")).toBe("identity");
  });

  it("sets json content-type", () => {
    expect(buildUpstreamHeaders(new Headers()).get("content-type")).toBe("application/json");
  });

  it("does not leak internal x-tre-* control headers upstream", () => {
    const out = buildUpstreamHeaders(new Headers({ "x-tre-session": "s1" }));
    expect(out.has("x-tre-session")).toBe(false);
  });
});

describe("buildClientHeaders", () => {
  it("strips framing headers fetch will recompute", () => {
    const h = new Headers({
      "content-type": "text/event-stream",
      "content-encoding": "gzip",
      "content-length": "42",
      "transfer-encoding": "chunked",
      "x-request-id": "abc",
    });
    const out = buildClientHeaders(h);
    expect(out.get("content-type")).toBe("text/event-stream");
    expect(out.get("x-request-id")).toBe("abc");
    expect(out.has("content-encoding")).toBe(false);
    expect(out.has("content-length")).toBe(false);
    expect(out.has("transfer-encoding")).toBe(false);
  });
});

describe("redactHeaders", () => {
  it("masks sensitive header values and keeps the rest", () => {
    const out = redactHeaders(
      new Headers({ authorization: "Bearer t", "x-api-key": "k", "user-agent": "ua" }),
    );
    expect(out.authorization).toBe("***redacted***");
    expect(out["x-api-key"]).toBe("***redacted***");
    expect(out["user-agent"]).toBe("ua");
  });
});
