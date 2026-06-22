// Small formatting + rough cost helpers for the dashboard.

export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString();
}

/**
 * Rough INPUT price per 1M tokens (USD), for a ballpark cost estimate in the
 * token calculator. These are approximations for illustration — always confirm
 * current pricing with your provider.
 */
export const INPUT_PRICE_PER_MTOK: Record<string, number> = {
  "claude-opus-4-8": 15,
  "claude-sonnet-4-6": 3,
  "claude-haiku-4-5": 1,
  "gpt-4o": 2.5,
  "gpt-4o-mini": 0.15,
  "o3": 10,
  generic: 3,
};

export const PRICED_MODELS = Object.keys(INPUT_PRICE_PER_MTOK);

export function estimateCost(tokens: number, model: string): number {
  const price = INPUT_PRICE_PER_MTOK[model] ?? INPUT_PRICE_PER_MTOK.generic!;
  return (tokens / 1_000_000) * price;
}

export function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(4)}`;
}
