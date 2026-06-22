import type { NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";

/**
 * STAGE: structured metadata extraction (optional).
 *
 * Extracts framework/language/constraints into a compact header block.
 *
 * HARD CONSTRAINT: this applies to *structured metadata only* — never
 * the core natural-language instruction. Models are trained on natural language;
 * DSL-ifying the instruction reduces task accuracy. Do not expand this stage to
 * touch the user's primary prompt without a benchmark proving accuracy holds.
 *
 * STUB: returns the request untouched. Disabled by default and likely to stay
 * that way until clearly justified.
 */
export const intentStage: Stage = {
  name: "intent",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    return { req, saved: 0, reversible: false, notes: "stub: no metadata extracted" };
  },
};
