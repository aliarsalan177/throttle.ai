/**
 * @tre/core — provider-agnostic token-reduction pipeline.
 *
 * Pure by design: no network, no filesystem. The proxy and MCP packages own all
 * I/O and call into this engine.
 */
export * from "./types.js";
export { defaultConfig, resolveConfig } from "./config.js";
export { ApproxTokenizer, approxTokenizer, BpeTokenizer, bpeTokenizer, isExactForModel } from "./tokenizer.js";
export { InMemoryContextRegistry } from "./memory.js";
export { InMemoryFileVersionStore } from "./fileStore.js";
export type { FileVersionStore } from "./fileStore.js";
export { InMemoryHistoryStore } from "./history.js";
export type {
  SessionHistoryStore,
  SessionCheckpoint,
  SessionSummary,
  SessionState,
  TurnRecord,
  AppendTurn,
} from "./history.js";
export { runPipeline, createSessionContext } from "./pipeline.js";
export type { RunPipelineOptions } from "./pipeline.js";
export { orderedStages, toggleKeyFor } from "./stages/index.js";
export { summarize, formatLogLine } from "./metrics.js";
export type { MetricsSummary } from "./metrics.js";
export { InMemoryMetricsStore } from "./metricsStore.js";
export type {
  MetricsStore,
  RequestMetric,
  MetricsAggregate,
  ModelBreakdown,
} from "./metricsStore.js";
