import type { ContentBlock, NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";
import { isText } from "./util.js";

/** Only collapse repeats at least this long — short text isn't worth a reference. */
const MIN_DUP_CHARS = 120;
const OMIT_MARKER = "[↑ identical to an earlier message in this conversation — omitted to save tokens]";

/**
 * STAGE: cross-turn context dedup — collapses provably-redundant repeats.
 *
 * Within a single request the full conversation history is present, so if a
 * large block of text appears verbatim more than once (e.g. a file pasted in an
 * early turn and again later), the model has already seen the first copy. Later
 * exact copies are replaced with a short reference back to it.
 *
 * Rule: only EXACT duplicates of substantial length are collapsed, and the FIRST
 * occurrence is always kept in full — we never drop context the model hasn't
 * seen. Still lossy in bytes, so `reversible: false` and off by default until
 * benchmarked.
 */
export const dedupStage: Stage = {
  name: "dedup",
  enabled: false,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    const seen = new Set<string>();
    let collapsed = 0;

    const messages = req.messages.map((m) => {
      const content: ContentBlock[] = m.content.map((block) => {
        if (!isText(block) || block.text.length < MIN_DUP_CHARS) return block;
        if (seen.has(block.text)) {
          collapsed++;
          return { ...block, text: OMIT_MARKER };
        }
        seen.add(block.text);
        return block;
      });
      return { ...m, content };
    });

    return {
      req: { ...req, messages },
      saved: 0,
      reversible: false,
      notes: collapsed > 0 ? `collapsed ${collapsed} duplicate block(s)` : "no duplicates found",
    };
  },
};
