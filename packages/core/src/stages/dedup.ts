import type { NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";

/**
 * STAGE: cross-turn context dedup (M2) — low risk, lossless.
 *
 * Hashes each stable context block (stack description, file contents, prior
 * outputs). If a block was seen earlier *this session* AND is unchanged, replace
 * it with a short reference the model already saw in the cached prefix.
 *
 * Hard rule: NEVER drop context the model hasn't actually
 * seen before. Dedup only collapses provably-redundant repeats.
 *
 * STUB: returns the request untouched; wired to the registry but performs no
 * substitution yet.
 */
export const dedupStage: Stage = {
  name: "dedup",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    return { req, saved: 0, reversible: true, notes: "stub: no blocks deduped" };
  },
};
