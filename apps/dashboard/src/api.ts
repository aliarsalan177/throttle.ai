// Typed client for the TRE proxy management API.
// Same-origin in dev (Vite proxies /v1 → the proxy); set VITE base elsewhere.

export interface StageToggles {
  cache: boolean;
  dedup: boolean;
  strip: boolean;
  filediff: boolean;
  slice: boolean;
  intent: boolean;
}

export interface TreConfig {
  stages: StageToggles;
  minSavingsTokens: number;
  store: boolean;
}

export interface ModelBreakdown {
  model: string;
  requests: number;
  tokensBefore: number;
  saved: number;
}

export interface MetricsAggregate {
  requests: number;
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  savedPct: number;
  avgDurationMs: number;
  byModel: ModelBreakdown[];
}

export interface RequestMetric {
  id: number;
  at: number;
  provider: string;
  model: string;
  sessionId: string;
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  durationMs: number;
}

export interface MetricsResponse {
  aggregate: MetricsAggregate;
  recent: RequestMetric[];
}

export interface SessionSummary {
  sessionId: string;
  model: string;
  turns: number;
  lastActive: number;
  totalTokens: number;
}

export interface TurnRecord {
  index: number;
  model: string;
  tokens: number;
  at: number;
}

export interface SessionCheckpoint {
  sessionId: string;
  model: string;
  messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
  timeline: TurnRecord[];
  turns: number;
  firstSeen: number;
  lastActive: number;
  totalTokens: number;
}

export interface TokenizeResponse {
  model: string;
  tokens: number;
  characters: number;
  approximate: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => fetch("/health").then((r) => json<{ ok: boolean }>(r)),
  metrics: (limit = 50) => fetch(`/v1/metrics?limit=${limit}`).then((r) => json<MetricsResponse>(r)),
  getConfig: () => fetch("/v1/config").then((r) => json<TreConfig>(r)),
  patchConfig: (patch: Partial<TreConfig>) =>
    fetch("/v1/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<TreConfig>(r)),
  sessions: () => fetch("/v1/sessions").then((r) => json<{ sessions: SessionSummary[] }>(r)),
  session: (id: string) => fetch(`/v1/sessions/${encodeURIComponent(id)}`).then((r) => json<SessionCheckpoint>(r)),
  deleteSession: (id: string) =>
    fetch(`/v1/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) => json<{ ok: boolean }>(r)),
  tokenize: (text: string, model: string) =>
    fetch("/v1/tokenize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, model }),
    }).then((r) => json<TokenizeResponse>(r)),
};
