import type { TreConfig } from "./types.js";

/**
 * Default config. Every potentially-lossy stage is OFF by default;
 * only lossless, zero-risk stages may eventually flip on once benchmarked.
 * M0 ships with everything off — pure passthrough.
 */
export const defaultConfig: TreConfig = {
  stages: {
    dedup: false,
    filediff: false,
    slice: false,
    strip: false,
    cache: false,
    intent: false,
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
