import type { ContentBlock, NormalizedMessage, NormalizedRequest, TextBlock } from "../types.js";

/** Fast, dependency-free FNV-1a hash (32-bit) as a hex string. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function isText(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

/** A stable identity for a block, used to detect exact duplicates. */
export function blockKey(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return "t:" + block.text;
    case "tool_use":
      return "u:" + block.id + block.name + JSON.stringify(block.input ?? null);
    case "tool_result":
      return "r:" + block.toolUseId + (typeof block.content === "string" ? block.content : JSON.stringify(block.content));
    case "raw":
      return "x:" + JSON.stringify(block.raw ?? null);
  }
}

/** Shallow-clone a request, replacing messages (keeps system/tools/raw refs). */
export function withMessages(req: NormalizedRequest, messages: NormalizedMessage[]): NormalizedRequest {
  return { ...req, messages };
}
