import type { NormalizedRequest, SessionContext, Stage, StageResult, TextBlock } from "../types.js";

/**
 * STAGE: cache-first — highest ROI, zero accuracy risk, fully lossless.
 *
 * Marks the stable request prefix so the provider serves it from cache on later
 * turns. The content is unchanged — only annotated — so token count is identical;
 * the win is on *cost*, not request size.
 *
 *  - Anthropic: set `cache_control: ephemeral` on the final system block (the
 *    largest stable chunk). Anthropic caches the prefix up to that breakpoint.
 *  - OpenAI: prefix caching is automatic with no markers, so this is a no-op.
 *
 * Idempotent: if a cache marker already exists we leave the request untouched.
 */
export const cacheStage: Stage = {
  name: "cache",
  enabled: true,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    if (req.provider !== "anthropic" || req.system.length === 0) {
      return { req, saved: 0, reversible: true, notes: "no cache breakpoint applied" };
    }
    if (req.system.some((s) => s.cacheControl)) {
      return { req, saved: 0, reversible: true, notes: "cache marker already present" };
    }
    const system: TextBlock[] = req.system.map((s, i) =>
      i === req.system.length - 1 ? { ...s, cacheControl: { type: "ephemeral" } } : s,
    );
    return {
      req: { ...req, system },
      saved: 0,
      reversible: true,
      notes: "cache_control on final system block",
    };
  },
};
