import type {
  ContentBlock,
  NormalizedMessage,
  NormalizedRequest,
  Role,
  TextBlock,
  ToolDef,
} from "@tre/core";
import type { Adapter } from "./types.js";

/**
 * OpenAI Chat Completions adapter (`POST /v1/chat/completions`).
 *
 * Reference shape:
 *   { model, messages: [{role, content: string|Part[], name?, tool_calls?, tool_call_id?}],
 *     tools?: [{type:"function", function:{name, description, parameters}}],
 *     max_tokens, temperature, top_p, stop, ... }
 *
 * Unlike Anthropic there is no top-level `system`; system prompts are messages
 * with role "system"/"developer". We keep them in `messages` and leave the
 * normalized `system` array empty. Message-level fields we don't model
 * (`tool_calls`, `tool_call_id`, `name`) are preserved on denormalize by zipping
 * against the original `raw.messages` by index.
 */

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : undefined;
}

function normalizeContent(content: unknown): ContentBlock[] {
  if (typeof content === "string") {
    return content.length ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) {
    // Non-string, non-array (e.g. null for a pure tool_call message).
    return [];
  }
  return content.map((part): ContentBlock => {
    const p = asObj(part);
    if (p && p.type === "text") return { type: "text", text: String(p.text ?? "") };
    return { type: "raw", raw: part };
  });
}

function normalizeTools(tools: unknown): ToolDef[] {
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => {
    const tool = asObj(t) ?? {};
    const fn = asObj(tool.function) ?? {};
    return {
      name: String(fn.name ?? ""),
      description: fn.description ? String(fn.description) : undefined,
      // Preserve the whole function object so denormalize is lossless.
      schema: tool.function ?? {},
    };
  });
}

/** Was this message's original content a plain string? Drives string vs array on the way out. */
function rawContentWasString(rawMessages: unknown, index: number): boolean {
  if (!Array.isArray(rawMessages)) return false;
  const m = asObj(rawMessages[index]);
  return typeof m?.content === "string";
}

function denormalizeContent(blocks: ContentBlock[], preferString: boolean): unknown {
  const allText = blocks.every((b) => b.type === "text");
  if (preferString && allText) {
    return blocks.map((b) => (b as TextBlock).text).join("");
  }
  return blocks.map((b) => (b.type === "text" ? { type: "text", text: b.text } : (b as { raw: unknown }).raw));
}

export const openaiAdapter: Adapter = {
  provider: "openai",
  path: "/v1/chat/completions",

  normalize(body: AnyObj): NormalizedRequest {
    const messages: NormalizedMessage[] = Array.isArray(body.messages)
      ? body.messages.map((m): NormalizedMessage => {
          const msg = asObj(m) ?? {};
          return {
            role: (msg.role as Role) ?? "user",
            content: normalizeContent(msg.content),
          };
        })
      : [];

    return {
      provider: "openai",
      model: String(body.model ?? ""),
      system: [], // OpenAI keeps system prompts inline as role:"system" messages
      messages,
      tools: normalizeTools(body.tools),
      stream: body.stream === true,
      params: {
        maxTokens:
          typeof body.max_tokens === "number"
            ? body.max_tokens
            : typeof body.max_completion_tokens === "number"
              ? body.max_completion_tokens
              : undefined,
        temperature: typeof body.temperature === "number" ? body.temperature : undefined,
        topP: typeof body.top_p === "number" ? body.top_p : undefined,
        stop: Array.isArray(body.stop) ? (body.stop as string[]) : undefined,
      },
      raw: body,
    };
  },

  denormalize(req: NormalizedRequest): AnyObj {
    const out: AnyObj = { ...req.raw };
    out.model = req.model;
    const rawMessages = (req.raw as AnyObj).messages;

    out.messages = req.messages.map((m, i) => {
      const original = Array.isArray(rawMessages) ? asObj(rawMessages[i]) : undefined;
      const preferString = rawContentWasString(rawMessages, i);
      // Spread original first to keep tool_calls / tool_call_id / name, then
      // overwrite role + content from the (possibly transformed) normalized msg.
      const msg: AnyObj = { ...(original ?? {}), role: m.role };
      // Only rewrite content when we actually have blocks. Otherwise keep the
      // original (e.g. `content: null` on a pure tool_call assistant message).
      if (m.content.length > 0) {
        msg.content = denormalizeContent(m.content, preferString);
      }
      return msg;
    });

    if (req.tools.length > 0) {
      out.tools = req.tools.map((t) => ({ type: "function", function: t.schema }));
    }
    return out;
  },
};
