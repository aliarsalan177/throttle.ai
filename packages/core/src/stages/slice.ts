import type { NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";

/**
 * STAGE: AST-aware focused file slicing (M3) — medium risk.
 *
 * When a large file is included but the task references specific symbols, slice
 * to the relevant function(s) plus the signatures of their dependencies, rather
 * than shipping the whole module. Uses `web-tree-sitter` (error-tolerant, many
 * languages) with `@babel/parser` as a TS/JS fallback.
 *
 * Lossy, so `reversible: false`, flag-gated, accuracy-tested before default-on.
 *
 * STUB: returns the request untouched.
 */
export const sliceStage: Stage = {
  name: "slice",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    return { req, saved: 0, reversible: false, notes: "stub: no files sliced" };
  },
};
