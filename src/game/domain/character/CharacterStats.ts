/**
 * Character attributes (Phase E1.1/E1.2 — cozy stats). A small fixed
 * attribute set, each only ever ADDING capability (cozy tone: no stat ever
 * reduces anything) — mirrors the "gentle" posture of `combat/PlayerVitals`.
 *
 * Vigor -> max health, Endurance -> max energy/stamina, Might -> gather AND
 * attack power, Fortune -> loot/find. Allocation is a spend/refund reducer
 * (Result-typed, err-explicit-result-handling) over a shared unspent-points
 * pool; refunding a point is always free (no cost, no penalty) and a full
 * `respecStats` is a one-call reset — the "never punishes the player"
 * invariant from the expansion plan.
 */

import { err, ok, type Result } from "../Result";

export type AttributeKey = "vigor" | "endurance" | "might" | "fortune";

export const ATTRIBUTE_KEYS: readonly AttributeKey[] = ["vigor", "endurance", "might", "fortune"];

export interface Attributes {
  readonly vigor: number;
  readonly endurance: number;
  readonly might: number;
  readonly fortune: number;
}

export function emptyAttributes(): Attributes {
  return { vigor: 0, endurance: 0, might: 0, fortune: 0 };
}

export interface CharacterStatsState {
  readonly attributes: Attributes;
  readonly unspentPoints: number;
}

export function emptyCharacterStats(unspentPoints = 0): CharacterStatsState {
  return { attributes: emptyAttributes(), unspentPoints };
}

export type StatAllocationError =
  | { readonly kind: "NoPointsAvailable" }
  | { readonly kind: "NothingToRefund"; readonly attribute: AttributeKey };

/** Spend one unspent point on an attribute. Never lets `unspentPoints` go
 *  negative — the caller must handle `NoPointsAvailable`. */
export function allocatePoint(
  state: CharacterStatsState,
  attribute: AttributeKey,
): Result<CharacterStatsState, StatAllocationError> {
  if (state.unspentPoints <= 0) return err({ kind: "NoPointsAvailable" });
  return ok({
    attributes: { ...state.attributes, [attribute]: state.attributes[attribute] + 1 },
    unspentPoints: state.unspentPoints - 1,
  });
}

/** Refund one point from an attribute back to the unspent pool — free,
 *  cozy: no cost, no cooldown. Never lets an attribute go negative. */
export function refundPoint(
  state: CharacterStatsState,
  attribute: AttributeKey,
): Result<CharacterStatsState, StatAllocationError> {
  if (state.attributes[attribute] <= 0) return err({ kind: "NothingToRefund", attribute });
  return ok({
    attributes: { ...state.attributes, [attribute]: state.attributes[attribute] - 1 },
    unspentPoints: state.unspentPoints + 1,
  });
}

/** Full free respec: every spent point returns to the unspent pool and every
 *  attribute resets to 0. Total points granted so far is conserved. */
export function respecStats(state: CharacterStatsState): CharacterStatsState {
  const spent = ATTRIBUTE_KEYS.reduce((sum, key) => sum + state.attributes[key], 0);
  return { attributes: emptyAttributes(), unspentPoints: state.unspentPoints + spent };
}

/** Adds points to the unspent pool (e.g. from a level-up grant). A no-op for
 *  non-positive amounts. */
export function grantStatPoints(state: CharacterStatsState, amount: number): CharacterStatsState {
  if (amount <= 0) return state;
  return { ...state, unspentPoints: state.unspentPoints + amount };
}

// ---- Only-add-power multipliers (cozy: every point is strictly additive) ----

/** Fraction of base max health added per Vigor point. */
export const VIGOR_HEALTH_PER_POINT = 0.05;
/** Fraction of base max energy/stamina added per Endurance point. */
export const ENDURANCE_ENERGY_PER_POINT = 0.05;
/** Fraction of base gather/attack power added per Might point. */
export const MIGHT_POWER_PER_POINT = 0.04;
/** Fraction of base loot/find added per Fortune point. */
export const FORTUNE_LOOT_PER_POINT = 0.03;

/** Multiplier to apply to `PLAYER_MAX_HEALTH` (PlayerVitals). Always >= 1. */
export function maxHealthMultiplier(attrs: Attributes): number {
  return 1 + attrs.vigor * VIGOR_HEALTH_PER_POINT;
}

/** Multiplier to apply to `STAMINA_MAX`/energy (Survival). Always >= 1. */
export function maxEnergyMultiplier(attrs: Attributes): number {
  return 1 + attrs.endurance * ENDURANCE_ENERGY_PER_POINT;
}

/** Multiplier for gather AND attack power (Might covers both, cozy-simple). */
export function powerMultiplier(attrs: Attributes): number {
  return 1 + attrs.might * MIGHT_POWER_PER_POINT;
}

/** Multiplier for loot quantity/find chance. */
export function lootMultiplier(attrs: Attributes): number {
  return 1 + attrs.fortune * FORTUNE_LOOT_PER_POINT;
}
