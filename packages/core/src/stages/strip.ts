import type { NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";

/**
 * STAGE: noise strip (M2) — low risk.
 *
 * Removes duplicated instructions, repeated boilerplate headers, and empty
 * filler. Conservative: only collapses content that is provably redundant
 * (exact-duplicate blocks, repeated system preambles), never paraphrased text.
 *
 * STUB: returns the request untouched.
 */
export const stripStage: Stage = {
  name: "strip",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    return { req, saved: 0, reversible: true, notes: "stub: no noise stripped" };
  },
};
