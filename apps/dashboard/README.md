# @tre/dashboard (phase 3 / M6)

Local-only web UI (Vite + React) to visualize token savings, browse request
logs, and toggle pipeline stages live.

**Status: placeholder.** Intentionally not built yet — earlier milestones land
first. When implemented it reads the metrics that `@tre/core`'s `metrics.ts`
emits and the proxy logs.

Planned stack: Vite + React, talking to a local read-only metrics endpoint on the
proxy. No cloud egress (local-first by default).
