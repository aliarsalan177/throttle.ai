import { encode } from "gpt-tokenizer";
import type { ContentBlock, NormalizedRequest, Tokenizer } from "./types.js";

/**
 * Token counting.
 *
 * The contract: never use char-count
 * estimates for billing-sensitive decisions. A later version swaps this stub for
 * real per-model tokenizers (`@anthropic-ai/tokenizer`, `tiktoken`).
 *
 * Until then we expose an *approximate* tokenizer that is clearly labelled as
 * such, so nothing downstream silently treats an estimate as exact. The ~4
 * chars/token heuristic is fine for relative before/after deltas in the current wiring,
 * NOT for spend reporting.
 */

/** Rough average bytes-per-token across English + code. Placeholder only. */
const APPROX_CHARS_PER_TOKEN = 4;

function approxCount(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function blockText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "tool_use":
      return block.name + JSON.stringify(block.input ?? null);
    case "tool_result":
      return typeof block.content === "string"
        ? block.content
        : block.content.map(blockText).join("");
    case "raw":
      return JSON.stringify(block.raw ?? null);
    default: {
      const _exhaustive: never = block;
      return String(_exhaustive);
    }
  }
}

/**
 * Approximate, model-agnostic tokenizer. `exact` is false so callers can refuse
 * to use it where precision matters.
 */
export class ApproxTokenizer implements Tokenizer {
  readonly exact = false;

  count(text: string, _model: string): number {
    return approxCount(text);
  }

  countRequest(req: NormalizedRequest): number {
    let total = 0;
    for (const sys of req.system) total += approxCount(sys.text);
    for (const msg of req.messages) {
      for (const block of msg.content) total += approxCount(blockText(block));
    }
    for (const tool of req.tools) {
      total += approxCount(tool.name + (tool.description ?? "") + JSON.stringify(tool.schema ?? null));
    }
    return total;
  }
}

export const approxTokenizer = new ApproxTokenizer();

/** True for OpenAI-family models, where the cl100k/o200k BPE count is exact. */
export function isExactForModel(model: string): boolean {
  return /^(gpt|o\d|text-|chatgpt|davinci|babbage)/i.test(model);
}

/**
 * Real BPE tokenizer backed by `gpt-tokenizer`. Exact for OpenAI models; for
 * other providers (e.g. Anthropic) it's a close estimate — far better than
 * char/4, but flagged inexact via {@link isExactForModel}.
 */
export class BpeTokenizer implements Tokenizer {
  readonly exact = true;

  count(text: string, _model: string): number {
    return text.length === 0 ? 0 : encode(text).length;
  }

  countRequest(req: NormalizedRequest): number {
    let total = 0;
    for (const sys of req.system) total += this.count(sys.text, req.model);
    for (const msg of req.messages) {
      for (const block of msg.content) total += this.count(blockText(block), req.model);
    }
    for (const tool of req.tools) {
      total += this.count(
        tool.name + (tool.description ?? "") + JSON.stringify(tool.schema ?? null),
        req.model,
      );
    }
    return total;
  }
}

export const bpeTokenizer = new BpeTokenizer();
