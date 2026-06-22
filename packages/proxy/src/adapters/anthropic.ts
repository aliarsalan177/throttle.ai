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
 * Anthropic Messages API adapter (`POST /v1/messages`).
 *
 * Reference shape:
 *   { model, system?: string|Block[], messages: [{role, content: string|Block[]}],
 *     tools?: [{name, description, input_schema}], max_tokens, temperature, ... }
 */

type AnyObj = Record<string, unknown>;

function asObj(v: unknown): AnyObj | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : undefined;
}

function normalizeContent(content: unknown): ContentBlock[] {
  if (typeof content === "string") {
    return content.length ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  return content.map((b): ContentBlock => {
    const block = asObj(b);
    if (!block) return { type: "raw", raw: b };
    switch (block.type) {
      case "text": {
        const tb: TextBlock = { type: "text", text: String(block.text ?? "") };
        if (asObj(block.cache_control)) tb.cacheControl = { type: "ephemeral" };
        return tb;
      }
      case "tool_use":
        return {
          type: "tool_use",
          id: String(block.id ?? ""),
          name: String(block.name ?? ""),
          input: block.input,
        };
      case "tool_result":
        return {
          type: "tool_result",
          toolUseId: String(block.tool_use_id ?? ""),
          content:
            typeof block.content === "string"
              ? block.content
              : normalizeContent(block.content),
          ...(block.is_error === true ? { isError: true } : {}),
        };
      default:
        return { type: "raw", raw: b };
    }
  });
}

function normalizeSystem(system: unknown): TextBlock[] {
  if (typeof system === "string") {
    return system.length ? [{ type: "text", text: system }] : [];
  }
  if (Array.isArray(system)) {
    return normalizeContent(system).filter((b): b is TextBlock => b.type === "text");
  }
  return [];
}

function normalizeTools(tools: unknown): ToolDef[] {
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => {
    const tool = asObj(t) ?? {};
    return {
      name: String(tool.name ?? ""),
      description: tool.description ? String(tool.description) : undefined,
      schema: tool.input_schema ?? {},
    };
  });
}

function denormalizeContent(blocks: ContentBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "text":
        return {
          type: "text",
          text: b.text,
          ...(b.cacheControl ? { cache_control: { type: "ephemeral" } } : {}),
        };
      case "tool_use":
        return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: b.toolUseId,
          content: typeof b.content === "string" ? b.content : denormalizeContent(b.content),
          ...(b.isError ? { is_error: true } : {}),
        };
      case "raw":
        return b.raw;
    }
  });
}

export const anthropicAdapter: Adapter = {
  provider: "anthropic",
  path: "/v1/messages",

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
      provider: "anthropic",
      model: String(body.model ?? ""),
      system: normalizeSystem(body.system),
      messages,
      tools: normalizeTools(body.tools),
      stream: body.stream === true,
      params: {
        maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
        temperature: typeof body.temperature === "number" ? body.temperature : undefined,
        topP: typeof body.top_p === "number" ? body.top_p : undefined,
        stop: Array.isArray(body.stop_sequences) ? (body.stop_sequences as string[]) : undefined,
      },
      raw: body,
    };
  },

  denormalize(req: NormalizedRequest): AnyObj {
    // Start from the original body so any unmodeled field survives, then
    // overwrite the parts a stage may have changed.
    const out: AnyObj = { ...req.raw };
    out.model = req.model;

    if (req.system.length === 0) {
      delete out.system;
    } else if (req.system.length === 1 && !req.system[0]!.cacheControl) {
      out.system = req.system[0]!.text;
    } else {
      out.system = req.system.map((s) => ({
        type: "text",
        text: s.text,
        ...(s.cacheControl ? { cache_control: { type: "ephemeral" } } : {}),
      }));
    }

    out.messages = req.messages.map((m) => ({
      role: m.role,
      content: denormalizeContent(m.content),
    }));

    if (req.tools.length > 0) {
      out.tools = req.tools.map((t) => ({
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        input_schema: t.schema,
      }));
    }
    return out;
  },
};
