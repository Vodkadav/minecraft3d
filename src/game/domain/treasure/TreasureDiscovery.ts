/**
 * Treasure claim/reward state machine (plan 8.7, [O]). Pure and non-mutating:
 * a treasure can be discovered exactly once; a second claim is an expected
 * failure surfaced as a Result value (err-explicit-result-handling). The state
 * is a plain serializable list of claimed ids — it persists as part of the M2
 * world save with no port of its own.
 */

import { err, ok, type Result } from "../Result";
import type { HiddenTreasure } from "./HiddenTreasure";
import type { ItemStack } from "../inventory/Inventory";

/** Immutable set of claimed treasure ids. */
export type DiscoveryState = readonly string[];

export type TreasureError = { readonly kind: "AlreadyClaimed"; readonly id: string };

export interface DiscoveryResult {
  readonly reward: readonly ItemStack[];
  readonly state: DiscoveryState;
}

export function emptyDiscovery(): DiscoveryState {
  return [];
}

export function isDiscovered(state: DiscoveryState, id: string): boolean {
  return state.includes(id);
}

/** Claim a treasure once, returning its reward and the updated state. */
export function discover(
  state: DiscoveryState,
  treasure: HiddenTreasure,
): Result<DiscoveryResult, TreasureError> {
  if (isDiscovered(state, treasure.id)) {
    return err({ kind: "AlreadyClaimed", id: treasure.id });
  }
  return ok({ reward: treasure.reward, state: [...state, treasure.id] });
}
