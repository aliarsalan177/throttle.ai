# @tre/dashboard

Local-only web UI (Vite + React) for the Token Reduction Engine.

## Tabs
- **📊 Overview** — live savings stats, an overall-reduction meter, and a savings-by-model chart.
- **📜 Requests** — recent forwarded requests with before/after tokens, saved, and pipeline latency.
- **🎛️ Stages** — toggle pipeline stages **live** (writes to the proxy's runtime config).
- **🧠 Sessions** — list saved conversations and preview the resume point; purge any session.
- **🔢 Token calculator** — paste text, see tokens/characters live, and a rough input-cost estimate per model.

## Run

The dashboard reads the proxy's management API, so start the proxy first:

```bash
# 1) proxy on 127.0.0.1:8787
node packages/proxy/dist/index.js        # or: pnpm dev:proxy

# 2) dashboard on 127.0.0.1:5173
pnpm --filter @tre/dashboard dev
```

In dev, Vite proxies `/v1` and `/health` to the proxy (same-origin, no CORS). Point it at a
different proxy with `TRE_PROXY_URL=http://127.0.0.1:9000 pnpm --filter @tre/dashboard dev`.

Build a static bundle with `pnpm --filter @tre/dashboard build` (output in `dist/`). When served
standalone, the proxy's CORS allows localhost origins.

Data source: the read-only metrics/config/session/tokenize endpoints on the proxy. No cloud egress.
