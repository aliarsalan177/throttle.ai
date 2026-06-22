import { createTwoFilesPatch } from "diff";
import type { ContentBlock, NormalizedRequest, SessionContext, Stage, StageResult } from "../types.js";
import { isText } from "./util.js";

/** Min length before a block is even considered a "file" worth diffing. */
const MIN_FILE_CHARS = 200;
/** First line must look like a path, optionally as a comment (`// path`, `# path`). */
const PATH_LINE = /^\s*(?:\/\/|#|--|\/\*)?\s*([\w./@-]+\.[A-Za-z][\w]{0,8})\s*\*?\/?\s*$/;

function detectPath(text: string): string | undefined {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const m = PATH_LINE.exec(firstLine);
  return m ? m[1] : undefined;
}

function unifiedDiff(path: string, oldText: string, newText: string): string {
  // Header lines are noise here; keep just the hunks.
  const patch = createTwoFilesPatch(path, path, oldText, newText, "previous", "current");
  return patch.split("\n").slice(2).join("\n").trimEnd();
}

/**
 * STAGE: file payload reduction via diff — medium risk, high reward.
 *
 * When a message re-sends a file (a long text block whose first line looks like
 * a path) that was seen earlier this session with different content, replace the
 * body with a unified diff against the stored version, plus a one-line manifest.
 * Unchanged re-sends are left to the dedup stage.
 *
 * Lossy relative to "send the whole file again", so `reversible: false`,
 * flag-gated, and off by default until accuracy-benchmarked. Requires
 * `ctx.files`; without it the stage is a safe no-op.
 */
export const filediffStage: Stage = {
  name: "filediff",
  enabled: false,
  run(req: NormalizedRequest, ctx: SessionContext): StageResult {
    const files = ctx.files;
    if (!files) return { req, saved: 0, reversible: false, notes: "no file store; skipped" };

    let diffed = 0;
    const messages = req.messages.map((m) => {
      const content: ContentBlock[] = m.content.map((block) => {
        if (!isText(block) || block.text.length < MIN_FILE_CHARS) return block;
        const path = detectPath(block.text);
        if (!path) return block;

        const prev = files.get(ctx.sessionId, path);
        files.put(ctx.sessionId, path, block.text);
        if (prev === undefined || prev === block.text) return block; // new or unchanged

        const diff = unifiedDiff(path, prev, block.text);
        // Only worth it if the diff is actually smaller than the file.
        if (diff.length >= block.text.length) return block;
        diffed++;
        return {
          ...block,
          text: `${path} — ${prev.split("\n").length} lines, sent as a diff vs. the previous version:\n\n${diff}`,
        };
      });
      return { ...m, content };
    });

    return {
      req: { ...req, messages },
      saved: 0,
      reversible: false,
      notes: diffed > 0 ? `diffed ${diffed} file(s)` : "no re-sent files to diff",
    };
  },
};
