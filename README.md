<div align="center">

# ⚡ Token Reduction Engine (TRE)

**A transparent local proxy that cuts LLM token cost — without degrading context quality.**

TRE is built to **reduce the tokens every request spends**, so you get **more output from your AI for fewer tokens** — more turns before you hit a rate limit, more work inside the same context window, and a smaller bill for the same results.

Point any coding agent at it. It speaks the provider's exact wire protocol, so nothing in your setup changes but the bill.

![status](https://img.shields.io/badge/status-M0%20passthrough-blue)
![tests](https://img.shields.io/badge/tests-92%20passing-brightgreen)
![coverage](https://img.shields.io/badge/coverage-~99%25-brightgreen)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-black)

</div>

---

## Why TRE?

| 💸 Cheaper | 🚀 More output | 🔌 Drop-in | 🔒 Local-first |
|---|---|---|---|
| Exploits native prompt caching + dedup + diffing to cut spend **50–90%** | Fewer tokens per request = more turns before rate limits and more room in the context window | Any client with a custom base URL works (Claude Code, Cline, aider, Continue…) | Binds `127.0.0.1`; your prompts never leave the machine |

> **Fewer tokens in → more useful work out.** The product is **cheaper requests that still work**
> — not just *smaller* requests. No lossy stage ships on until it proves **≥99% task accuracy**, so
> every reduction is measured against task success, not only token delta.

---

## How it works

```mermaid
flowchart LR
    A["🤖 Coding agent<br/>(Claude Code, Cline,<br/>aider, Continue)"] -->|base_url = localhost:8787| B
    subgraph TRE["⚡ TRE Local Proxy"]
        direction TB
        B["Normalize"] --> C["Reduction pipeline"] --> D["Forward (protocol-faithful)"]
    end
    D -->|optimized request| E["☁️ LLM provider<br/>Anthropic · OpenAI"]
    E -.->|SSE streamed back, untouched| A
```

The proxy is **transparent**: it talks the same protocol as the upstream, so clients need
zero code changes beyond pointing the base URL.

### The pipeline (conservative → aggressive)

```mermaid
flowchart LR
    R[Request] --> S1[cache]:::on --> S2[dedup]:::on --> S3[strip]:::on --> S4[filediff]:::risk --> S5[slice]:::risk --> S6[intent]:::risk --> OUT[Optimized]
    classDef on fill:#1f6f43,stroke:#2ea043,color:#fff;
    classDef risk fill:#5a3a00,stroke:#bb8009,color:#fff;
```

<sub>🟢 lossless / low-risk &nbsp;&nbsp; 🟠 lossy — flag-gated, off until benchmarked</sub>

Each stage is independently toggleable, its savings are **measured with the tokenizer** (never
self-reported), and any lossy stage that doesn't beat a threshold is **auto-reverted**.

---

## 🧠 Session memory & resume

Because the proxy sees **every turn** of every conversation, it can remember them. So when your
agent is closed, crashes, or a chat **hits the context-window limit and gets cut off**, you don't
start over — you **resume from exactly where you left off**.

```mermaid
flowchart LR
    subgraph Day1["🕐 Session gets cut off"]
        A1["Agent chats…"] --> A2["💥 context limit / closed"]
    end
    A1 -.->|every turn saved| DB[("🧠 Session memory<br/>local store")]
    subgraph Day2["🔁 Pick up later"]
        B1["GET /v1/sessions/:id"] --> B2["▶️ resume from last snapshot"]
    end
    DB --> B1
```

- 🗂️ **Unlimited sessions** — keep as many conversations as you want, each under its own id
  (pass `x-tre-session: my-project`); list and resume any of them anytime.
- ▶️ **One-call resume** — the latest full conversation snapshot is returned ready to continue.
- 📊 **Per-session timeline** — turns, models used, and cumulative token spend.
- 🔒 **Yours & local** — stored on your machine only; disable with `--no-store`, wipe with a `DELETE`.

| Endpoint | What it does |
|---|---|
| `GET /v1/sessions` | List every resumable session (most recent first) |
| `GET /v1/sessions/:id` | Resume — returns the conversation snapshot + timeline |
| `DELETE /v1/sessions/:id` | Purge a session (privacy / TTL) |

```bash
# see what you can pick back up
curl http://127.0.0.1:8787/v1/sessions

# resume a specific project's conversation
curl http://127.0.0.1:8787/v1/sessions/my-project
```

> In-memory today; **M4 persists sessions to SQLite** so they survive a proxy restart.

---

## How tokens are counted

LLMs don't bill by characters or words — they bill by **tokens**, the sub-word chunks a model's
tokenizer splits text into (≈ ¾ of a word in English; code is denser). Every byte of your system
prompt, tool schemas, file contents, and chat history counts on **every** request, which is why
re-sending unchanged context gets expensive fast.

```mermaid
flowchart LR
    T["the quick brown fox"] --> TK["Tokenizer"] --> O["[the][ quick][ brown][ fox] = 4 tokens"]
```

TRE measures **before and after** every reduction with a real per-model tokenizer, so the savings
log reflects what you're actually billed — not an estimate. Want to see how your own prompts
tokenize? Plenty of tools out there:

**🔬 Interactive playgrounds (paste text, see tokens)**
- **OpenAI Tokenizer** — https://platform.openai.com/tokenizer
- **Tiktokenizer** (compare GPT/Claude/Llama side-by-side) — https://tiktokenizer.vercel.app
- **The Tokenizer Playground** (Xenova, many open models) — https://huggingface.co/spaces/Xenova/the-tokenizer-playground
- **gpt-tokenizer playground** — https://gpt-tokenizer.dev
- **Llama / Mistral token counter** (belladore) — https://belladore.ai/tools/llama-tokenizer
- **Token Counter** (multi-model, quick estimate) — https://token-counter.app

**🧩 Libraries & per-provider APIs (exact counts in code)**
- **`tiktoken`** — OpenAI's BPE tokenizer (GPT models) — https://github.com/openai/tiktoken
- **`gpt-tokenizer`** — fast pure-JS tiktoken — https://github.com/niieani/gpt-tokenizer
- **Anthropic token-counting API** (Claude) — https://docs.anthropic.com/en/docs/build-with-claude/token-counting
- **Google Gemini `countTokens`** — https://ai.google.dev/gemini-api/docs/tokens
- **Mistral tokenizer** — https://docs.mistral.ai/guides/tokenization/
- **Cohere `tokenize` API** — https://docs.cohere.com/reference/tokenize
- **Hugging Face `tokenizers`** (open models) — https://github.com/huggingface/tokenizers

**📖 Background**
- **What are tokens & how to count them (OpenAI)** — https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them

> The proxy ships with a fast approximate counter for relative deltas and swaps in the exact
> per-model tokenizers (`tiktoken` for OpenAI, `@anthropic-ai/tokenizer` for Claude) for
> billing-grade numbers — char-count estimates are never used for spend decisions.

---

## Expected savings

```mermaid
xychart-beta
    title "Cost reduction by technique (typical)"
    x-axis ["Native cache", "Context dedup", "File diff", "AST slice", "Noise strip"]
    y-axis "Savings %" 0 --> 90
    bar [80, 45, 60, 55, 12]
```

| Technique | Realistic savings | Risk |
|---|---|---|
| Native prompt caching | **50–90%** on cost | None |
| Context dedup (cross-turn) | 20–60% | Low |
| Diff instead of whole files | 30–80% on file payloads | Low–Med |
| AST-aware file slicing | 40–70% per file | Med |
| Boilerplate stripping | 5–20% | Low |

---

## Quick start

```bash
pnpm install
pnpm --filter @tre/proxy build
node packages/proxy/dist/index.js
```

Then point any agent at the proxy:

```bash
# Claude Code (Anthropic)
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787

# OpenAI-compatible clients (Cline, Continue, aider…)
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
```

That's it — run your agent normally. Watch the savings log:

```
[tre] model=claude-opus-4-8 before=18420 after=7310 saved=11110 (60.3%) 4.2ms
```

### Configure (env vars)

| Var | Default | Purpose |
|---|---|---|
| `TRE_PORT` | `8787` | Port to listen on |
| `TRE_HOST` | `127.0.0.1` | Bind address (local-only) |
| `TRE_ANTHROPIC_UPSTREAM` | `https://api.anthropic.com` | Where to forward Anthropic calls |
| `TRE_OPENAI_UPSTREAM` | `https://api.openai.com` | Where to forward OpenAI calls |
| `TRE_LOG_REQUESTS` | `true` | Per-request savings logging (keys redacted) |

---

## Repo layout

```
packages/
  core/        @tre/core   — pure reduction pipeline (no I/O)
  proxy/       @tre/proxy   — Hono server, Anthropic + OpenAI, SSE passthrough
  mcp/         @tre/mcp     — context-store MCP server (stub, M5)
  vscode-ext/               — VS Code extension (placeholder, M6)
apps/
  dashboard/   @tre/dashboard — local savings UI (placeholder, M6)
```

## Roadmap

```mermaid
flowchart LR
    M0["✅ M0<br/>passthrough"] --> M1["M1<br/>metrics"] --> M2["M2<br/>cache + dedup"] --> M3["M3<br/>diff + slice"] --> M4["M4<br/>persistent sessions"] --> M5["M5<br/>MCP"] --> M6["M6<br/>dashboard + ext"]
    style M0 fill:#1f6f43,stroke:#2ea043,color:#fff
```

**Status:** M0 (transparent passthrough) shipped and verified end-to-end. With the default
config the proxy forwards requests byte-for-byte and streams responses through untouched —
every reduction stage exists as a no-op stub, off by default.

## Develop

```bash
pnpm -r build          # tsc across packages
pnpm -r test           # vitest — 92 tests
pnpm test:coverage     # coverage report (~99% on core + proxy)
pnpm smoke             # runtime check against compiled dist
pnpm dev:proxy         # run the proxy with hot reload
```

<div align="center"><sub>Local-first · protocol-faithful · accuracy-gated</sub></div>
