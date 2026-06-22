import type { Stage, StageToggles } from "../types.js";
import { cacheStage } from "./cache.js";
import { dedupStage } from "./dedup.js";
import { stripStage } from "./strip.js";
import { filediffStage } from "./filediff.js";
import { sliceStage } from "./slice.js";
import { intentStage } from "./intent.js";

/**
 * Canonical stage order: conservative → aggressive.
 *
 *   cache → dedup → strip → filediff → slice → intent
 *
 * Lossless, zero-risk stages run first so the safe wins are captured before any
 * lossy transform is even considered.
 */
export const orderedStages: Stage[] = [
  cacheStage,
  dedupStage,
  stripStage,
  filediffStage,
  sliceStage,
  intentStage,
];

/** Map a stage name to the matching toggle key. Keep in sync with StageToggles. */
export function toggleKeyFor(name: string): keyof StageToggles | undefined {
  const keys: Record<string, keyof StageToggles> = {
    cache: "cache",
    dedup: "dedup",
    strip: "strip",
    filediff: "filediff",
    slice: "slice",
    intent: "intent",
  };
  return keys[name];
}

export { cacheStage, dedupStage, stripStage, filediffStage, sliceStage, intentStage };
