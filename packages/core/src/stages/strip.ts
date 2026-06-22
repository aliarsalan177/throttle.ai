import type { ContentBlock, NormalizedRequest, SessionContext, Stage, StageResult, TextBlock } from "../types.js";
import { blockKey, isText } from "./util.js";

/**
 * STAGE: noise strip — low risk, lossless in meaning.
 *
 * Conservative, semantics-preserving cleanups only:
 *  - collapse runs of 3+ blank lines inside text blocks to a single blank line,
 *  - trim trailing whitespace on each line,
 *  - drop empty text blocks,
 *  - remove an *exact-duplicate* text block that repeats verbatim earlier in the
 *    same message (repeated boilerplate headers carry no new information).
 *
 * It never paraphrases or drops unique content, so the result is treated as
 * reversible (no information lost).
 */
function cleanText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function stripMessageContent(content: ContentBlock[]): ContentBlock[] {
  const seenText = new Set<string>();
  const out: ContentBlock[] = [];
  for (const block of content) {
    if (!isText(block)) {
      out.push(block);
      continue;
    }
    const cleaned = cleanText(block.text);
    if (cleaned.trim().length === 0) continue; // drop empty/whitespace-only
    const key = "t:" + cleaned;
    if (seenText.has(key)) continue; // exact-duplicate boilerplate
    seenText.add(key);
    const next: TextBlock = { ...block, text: cleaned };
    out.push(next);
  }
  return out;
}

export const stripStage: Stage = {
  name: "strip",
  enabled: true,
  run(req: NormalizedRequest, _ctx: SessionContext): StageResult {
    // Dedup identical system blocks and clean their text.
    const sysSeen = new Set<string>();
    const system: TextBlock[] = [];
    for (const s of req.system) {
      const cleaned = cleanText(s.text);
      if (cleaned.trim().length === 0) continue;
      const key = blockKey({ ...s, text: cleaned });
      if (sysSeen.has(key)) continue;
      sysSeen.add(key);
      system.push({ ...s, text: cleaned });
    }

    const messages = req.messages.map((m) => ({ ...m, content: stripMessageContent(m.content) }));

    return {
      req: { ...req, system, messages },
      saved: 0,
      reversible: true,
      notes: "cleaned whitespace + removed duplicate text blocks",
    };
  },
};
