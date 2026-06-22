#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

/**
 * CLI entrypoint. Binds 127.0.0.1 by default (security model §5) and prints the
 * base URLs to point coding agents at.
 */
function main(): void {
  const proxyConfig = loadConfig();
  const { app } = createServer({ proxyConfig });

  serve({ fetch: app.fetch, hostname: proxyConfig.host, port: proxyConfig.port }, (info) => {
    const base = `http://${proxyConfig.host}:${info.port}`;
    console.log(`[tre] proxy listening on ${base}`);
    console.log(`[tre]   Anthropic  → set ANTHROPIC_BASE_URL=${base}`);
    console.log(`[tre]   OpenAI     → set OPENAI_BASE_URL=${base}/v1`);
    console.log(`[tre]   upstream(anthropic)=${proxyConfig.upstream.anthropic}`);
    console.log(`[tre]   upstream(openai)=${proxyConfig.upstream.openai}`);
  });
}

main();
