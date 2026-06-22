/**
 * Core type contracts for the Token Reduction Engine.
 *
 * The proxy speaks the Anthropic and OpenAI wire protocols, but every reduction
 * stage operates on ONE internal shape: {@link NormalizedRequest}. Adapters in
 * `@tre/proxy` translate provider payloads to/from this shape so the pipeline is
 * provider-agnostic.
 *
 * Design rule: a stage may only mutate request
 * content. It must NEVER alter tool schemas or response-format fields — those
 * affect correctness — and it must report whether its change is reversible.
 */

import type { FileVersionStore } from "./fileStore.js";

export type Provider = "anthropic" | "openai";

export type Role = "system" | "user" | "assistant" | "tool";

/**
 * Provider-neutral content block. We keep a small, lossless superset of the two
 * protocols' block types. Anything we don't model explicitly is preserved
 * verbatim in {@link RawBlock} so normalization stays lossless.
 */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | RawBlock;

export interface TextBlock {
  type: "text";
  text: string;
  /**
   * Provider cache hint. When set, the adapter emits the provider-native cache
   * marker (Anthropic `cache_control`, OpenAI handles prefix caching
   * automatically). Set by the `cache` stage; never invented elsewhere.
   */
  cacheControl?: CacheControl;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string | ContentBlock[];
  isError?: boolean;
}

/**
 * Escape hatch: a block we chose not to normalize. `raw` is the original,
 * untouched provider JSON for this block. Stages must pass these through
 * unchanged.
 */
export interface RawBlock {
  type: "raw";
  raw: unknown;
}

export interface CacheControl {
  type: "ephemeral";
}

export interface NormalizedMessage {
  role: Role;
  content: ContentBlock[];
}

/**
 * Tool definition. Held opaquely on purpose: ADR (gotchas) forbids stages from
 * editing tool schemas, so we never destructure `parameters`/`inputSchema`.
 */
export interface ToolDef {
  name: string;
  description?: string;
  /** Original provider schema object, passed through untouched. */
  schema: unknown;
}

/** Generation params we forward verbatim (temperature, max_tokens, etc.). */
export interface SamplingParams {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  [key: string]: unknown;
}

export interface NormalizedRequest {
  provider: Provider;
  model: string;
  /** System prompt, normalized to text blocks (Anthropic `system`, OpenAI system msg). */
  system: TextBlock[];
  messages: NormalizedMessage[];
  tools: ToolDef[];
  stream: boolean;
  params: SamplingParams;
  /**
   * The original, untouched provider request body. The adapter uses this as the
   * base when denormalizing, so any field we didn't model survives round-trip.
   */
  raw: Record<string, unknown>;
}

/**
 * Per-stage outcome. `saved` is measured by the pipeline against the tokenizer,
 * not self-reported, but a stage may annotate intent via `notes`.
 */
export interface StageResult {
  req: NormalizedRequest;
  /** Tokens removed by this stage (filled in by the pipeline using the tokenizer). */
  saved: number;
  /** Can the original be reconstructed from this output? (ADR gotchas: tag honestly.) */
  reversible: boolean;
  notes?: string;
}

export interface SessionContext {
  /** Stable per-client-session id; used to key the cross-turn context registry. */
  sessionId: string;
  config: TreConfig;
  tokenizer: Tokenizer;
  registry: ContextRegistry;
  /** Optional per-session file-version store; enables cross-turn file diffing. */
  files?: FileVersionStore;
}

export interface Stage {
  name: string;
  enabled: boolean;
  run(req: NormalizedRequest, ctx: SessionContext): StageResult | Promise<StageResult>;
}

/** Accurate, per-model token counter. Char-count estimates are forbidden for billing decisions. */
export interface Tokenizer {
  /** Count tokens for an arbitrary string under the given model. */
  count(text: string, model: string): number;
  /** Count tokens for a full normalized request (system + messages + tools). */
  countRequest(req: NormalizedRequest): number;
}

/** Content-hash → context-id registry for cross-turn dedup (filled in later). */
export interface ContextRegistry {
  /** Return an existing id for this content hash, or undefined if unseen this session. */
  lookup(sessionId: string, hash: string): string | undefined;
  /** Record content under a stable id and return that id. */
  register(sessionId: string, hash: string, bytes: number): string;
}

export interface StageToggles {
  dedup: boolean;
  filediff: boolean;
  slice: boolean;
  strip: boolean;
  cache: boolean;
  intent: boolean;
}

export interface TreConfig {
  /** Per-stage on/off. Risky stages default OFF until benchmarked. */
  stages: StageToggles;
  /** Skip a risky stage if it saves fewer than this many tokens. */
  minSavingsTokens: number;
  /** Persist prompt bodies to the local store? `false` => --no-store mode. */
  store: boolean;
}

export interface PipelineMetrics {
  tokensBefore: number;
  tokensAfter: number;
  saved: number;
  perStage: Array<{ name: string; saved: number; reversible: boolean; notes?: string }>;
  /** Wall-clock spent in the pipeline (ms). Target: <50ms p50. */
  durationMs: number;
}

export interface PipelineOutput {
  req: NormalizedRequest;
  metrics: PipelineMetrics;
}
