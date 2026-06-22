import type { NormalizedRequest, Provider } from "@tre/core";

/**
 * Translates a provider wire payload to/from the internal NormalizedRequest.
 *
 * Round-trip contract: for any body we accept, `denormalize(normalize(body))`
 * must be semantically equivalent to `body`. Fields we don't model are preserved
 * via {@link NormalizedRequest.raw} and per-message/-block raw escape hatches.
 */
export interface Adapter {
  provider: Provider;
  /** Path this adapter serves, e.g. "/v1/messages". */
  path: string;
  normalize(body: Record<string, unknown>): NormalizedRequest;
  denormalize(req: NormalizedRequest): Record<string, unknown>;
}
