/**
 * Eating (Workstream 5.2) — pure composition of a food item's restore values
 * onto PlayerVitals (health) and SurvivalState (hunger). Kept as its own tiny
 * module rather than folding into either: it only ever reads/writes through
 * their existing public shapes (never reaches into internals), matching
 * "compose, don't rewrite".
 */

import { PLAYER_MAX_HEALTH, type PlayerVitals } from "../combat/PlayerVitals";
import type { FoodMetadata } from "../items/ItemDefinition";
import { restoreHunger, type SurvivalState } from "./Survival";

export function isFood(def: { readonly food?: FoodMetadata }): boolean {
  return def.food !== undefined;
}

export interface EatResult {
  readonly vitals: PlayerVitals;
  readonly survival: SurvivalState;
}

/** Applies one food item's restore values. A no-op on health for a dead or
 *  already-full player; hunger restore is always applied (capped at max). */
export function eat(
  vitals: PlayerVitals,
  survival: SurvivalState,
  food: FoodMetadata,
): EatResult {
  const survivalNext = restoreHunger(survival, food.hungerRestore);
  const canHeal = food.healthRestore > 0 && !vitals.dead && vitals.health < PLAYER_MAX_HEALTH;
  const vitalsNext = canHeal
    ? { ...vitals, health: Math.min(PLAYER_MAX_HEALTH, vitals.health + food.healthRestore) }
    : vitals;
  return { vitals: vitalsNext, survival: survivalNext };
}
