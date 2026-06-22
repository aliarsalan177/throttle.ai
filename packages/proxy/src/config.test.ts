import { describe, it, expect } from "vitest";
import { loadConfig, HOP_BY_HOP_HEADERS, SENSITIVE_HEADERS } from "./config.js";

describe("loadConfig", () => {
  it("uses local-first defaults (127.0.0.1:8787, official upstreams)", () => {
    const c = loadConfig({});
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(8787);
    expect(c.upstream.anthropic).toBe("https://api.anthropic.com");
    expect(c.upstream.openai).toBe("https://api.openai.com");
    expect(c.logRequests).toBe(true);
  });

  it("reads host/port and upstream overrides from env", () => {
    const c = loadConfig({
      TRE_HOST: "0.0.0.0",
      TRE_PORT: "9000",
      TRE_ANTHROPIC_UPSTREAM: "http://local-anthropic:1",
      TRE_OPENAI_UPSTREAM: "http://local-openai:2",
    });
    expect(c.host).toBe("0.0.0.0");
    expect(c.port).toBe(9000);
    expect(c.upstream.anthropic).toBe("http://local-anthropic:1");
    expect(c.upstream.openai).toBe("http://local-openai:2");
  });

  it("strips trailing slashes from upstream URLs", () => {
    const c = loadConfig({ TRE_ANTHROPIC_UPSTREAM: "https://api.anthropic.com///" });
    expect(c.upstream.anthropic).toBe("https://api.anthropic.com");
  });

  it("disables request logging only when explicitly set to 'false'", () => {
    expect(loadConfig({ TRE_LOG_REQUESTS: "false" }).logRequests).toBe(false);
    expect(loadConfig({ TRE_LOG_REQUESTS: "true" }).logRequests).toBe(true);
    expect(loadConfig({ TRE_LOG_REQUESTS: "0" }).logRequests).toBe(true);
  });
});

describe("header policy sets", () => {
  it("treats host/content-length/connection as hop-by-hop", () => {
    expect(HOP_BY_HOP_HEADERS.has("host")).toBe(true);
    expect(HOP_BY_HOP_HEADERS.has("content-length")).toBe(true);
  });

  it("marks the auth headers as sensitive for redaction", () => {
    expect(SENSITIVE_HEADERS.has("authorization")).toBe(true);
    expect(SENSITIVE_HEADERS.has("x-api-key")).toBe(true);
  });
});
