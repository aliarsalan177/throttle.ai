import type { NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";

/**
 * STAGE: file payload reduction via diff (M3) — medium risk, high reward.
 *
 * When a message re-sends a full file that appeared in a prior turn, replace the
 * body with a semantic diff (git-style text diff first; AST patch when symbol-
 * level precision is needed). Keeps a manifest so omitted regions are explicit.
 *
 * Lossy relative to "send the whole file again", so `reversible: false` and
 * gated behind a config flag + golden-fixture accuracy tests before default-on.
 *
 * STUB: returns the request untouched.
 */
export const filediffStage: Stage = {
  name: "filediff",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    return { req, saved: 0, reversible: false, notes: "stub: no files diffed" };
  },
};
