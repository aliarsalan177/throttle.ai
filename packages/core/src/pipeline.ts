import type {
  NormalizedRequest,
  PipelineOutput,
  SessionContext,
  Stage,
} from "./types.js";
import { orderedStages, toggleKeyFor } from "./stages/index.js";

export interface RunPipelineOptions {
  /** Override the stage set (tests inject custom stages). Defaults to {@link orderedStages}. */
  stages?: Stage[];
  /** Monotonic clock; injected so the pure pipeline stays deterministic in tests. */
  now?: () => number;
}

/**
 * Run the reduction pipeline over a normalized request.
 *
 * Invariants:
 *  - Stages run in fixed order (conservative → aggressive).
 *  - A stage executes only if enabled in {@link SessionContext.config}.
 *  - `saved` is MEASURED with the tokenizer, never trusted from the stage.
 *  - Guardrail: a lossy stage (`reversible: false`) whose
 *    measured savings fall below `minSavingsTokens` is reverted — not worth the
 *    accuracy risk for a tiny win.
 *
 * With the default config (all stages off) this is an exact passthrough that
 * still emits a baseline token count.
 */
export async function runPipeline(
  input: NormalizedRequest,
  ctx: SessionContext,
  opts: RunPipelineOptions = {},
): Promise<PipelineOutput> {
  const stages = opts.stages ?? orderedStages;
  const clock = opts.now ?? (() => performance.now());
  const start = clock();

  const tokensBefore = ctx.tokenizer.countRequest(input);
  let current = input;
  let runningTokens = tokensBefore;
  const perStage: PipelineOutput["metrics"]["perStage"] = [];

  for (const stage of stages) {
    const toggleKey = toggleKeyFor(stage.name);
    const enabled = toggleKey ? ctx.config.stages[toggleKey] : stage.enabled;
    if (!enabled) continue;

    const before = runningTokens;
    const result = await stage.run(current, ctx);
    const after = ctx.tokenizer.countRequest(result.req);
    const measuredSaved = before - after;

    // Guardrail: revert a lossy stage that didn't earn its risk.
    const tooRisky = !result.reversible && measuredSaved < ctx.config.minSavingsTokens;
    if (tooRisky) {
      perStage.push({
        name: stage.name,
        saved: 0,
        reversible: result.reversible,
        notes: `reverted: saved ${measuredSaved} < min ${ctx.config.minSavingsTokens}`,
      });
      continue;
    }

    current = result.req;
    runningTokens = after;
    perStage.push({
      name: stage.name,
      saved: measuredSaved,
      reversible: result.reversible,
      notes: result.notes,
    });
  }

  const tokensAfter = runningTokens;
  return {
    req: current,
    metrics: {
      tokensBefore,
      tokensAfter,
      saved: tokensBefore - tokensAfter,
      perStage,
      durationMs: clock() - start,
    },
  };
}

/** Build a SessionContext from parts, with sensible defaults wired in. */
export function createSessionContext(
  parts: Pick<SessionContext, "sessionId" | "config" | "tokenizer" | "registry" | "files">,
): SessionContext {
  return parts;
}
