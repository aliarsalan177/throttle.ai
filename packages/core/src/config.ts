import type { TreConfig } from "./types.js";

/**
 * Default config.
 *
 * Lossless, low-risk stages ship ON (cache adds only provider cache markers;
 * strip removes whitespace + exact-duplicate boilerplate). Every potentially-
 * lossy stage stays OFF until benchmarked and is opt-in via the dashboard.
 */
export const defaultConfig: TreConfig = {
  stages: {
    cache: true, // lossless: only annotates the stable prefix for provider caching
    strip: true, // lossless: whitespace + exact-duplicate boilerplate removal
    dedup: false, // lossy: collapses repeated context — opt-in
    filediff: false, // lossy: file → diff — opt-in
    slice: false, // lossy/experimental
    intent: false, // experimental
  },
  minSavingsTokens: 32,
  store: true,
};

export function resolveConfig(partial?: Partial<TreConfig>): TreConfig {
  return {
    ...defaultConfig,
    ...partial,
    stages: { ...defaultConfig.stages, ...partial?.stages },
  };
}
