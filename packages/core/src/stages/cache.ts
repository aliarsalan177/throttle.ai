import type { NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";

/**
 * STAGE: cache-first (M2) — highest ROI, zero accuracy risk.
 *
 * Identifies the stable request prefix (system prompt, tool defs, long-lived
 * project context) and tags the boundary block with provider-native cache
 * markers so the upstream serves it from cache on subsequent turns. Lossless:
 * the content is unchanged, only annotated.
 *
 * STUB: returns the request untouched. Real implementation lands in M2 once we
 * confirm per-provider caching behavior empirically.
 */
export const cacheStage: Stage = {
  name: "cache",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    return { req, saved: 0, reversible: true, notes: "stub: no markers injected" };
  },
};
