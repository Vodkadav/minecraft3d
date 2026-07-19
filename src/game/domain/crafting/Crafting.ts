/**
 * The crafting graph and its operations. A recipe consumes ingredients and
 * yields an output once its `unlockTier` is reached. Crafting composes the
 * {@link Inventory} model rather than re-implementing stacking — consume via
 * `remove`, place via `add`. Immutability makes the operation atomic: on any
 * failure the caller keeps the original inventory (err-explicit-result-handling).
 */

import { err, isErr, isOk, ok, type Result } from "../Result";
import type { Inventory } from "../inventory/Inventory";

export interface ItemQuantity {
  readonly itemId: string;
  readonly count: number;
}

/** A required nearby placeable (Workstream 8.4) — absent means craftable anywhere. */
export type Station = "workbench" | "campfire";

/** Cooking jobs (domain/placeables/Campfire) default to this when unset. */
export const DEFAULT_COOK_DURATION_S = 10;

export interface Recipe {
  readonly id: string;
  readonly ingredients: readonly ItemQuantity[];
  readonly output: ItemQuantity;
  readonly unlockTier: number;
  readonly station?: Station;
  /** Cooking duration (s) — meaningful only when station === "campfire". */
  readonly cookDurationS?: number;
}

export interface MissingIngredient {
  readonly itemId: string;
  readonly need: number;
  readonly have: number;
}

export type CraftError =
  | { readonly kind: "Locked"; readonly requiredTier: number; readonly unlockedTier: number }
  | { readonly kind: "MissingIngredients"; readonly missing: readonly MissingIngredient[] }
  | { readonly kind: "OutputWontFit"; readonly itemId: string; readonly remaining: number }
  | { readonly kind: "StationRequired"; readonly station: Station };

/** True when the recipe has no station requirement or the required one is nearby. */
export function stationSatisfied(recipe: Recipe, nearbyStations: ReadonlySet<Station>): boolean {
  return recipe.station === undefined || nearbyStations.has(recipe.station);
}

function attempt(
  inventory: Inventory,
  recipe: Recipe,
  unlockedTier: number,
  nearbyStations: ReadonlySet<Station> = new Set(),
): Result<Inventory, CraftError> {
  if (recipe.unlockTier > unlockedTier) {
    return err({ kind: "Locked", requiredTier: recipe.unlockTier, unlockedTier });
  }
  if (!stationSatisfied(recipe, nearbyStations)) {
    return err({ kind: "StationRequired", station: recipe.station as Station });
  }

  const missing = recipe.ingredients
    .map((ing) => ({ itemId: ing.itemId, need: ing.count, have: inventory.count(ing.itemId) }))
    .filter((m) => m.have < m.need);
  if (missing.length > 0) return err({ kind: "MissingIngredients", missing });

  let working = inventory;
  for (const ing of recipe.ingredients) {
    const removed = working.remove(ing.itemId, ing.count);
    if (!isOk(removed)) return err({ kind: "MissingIngredients", missing });
    working = removed.value;
  }

  const placed = working.add(recipe.output.itemId, recipe.output.count);
  if (isErr(placed)) {
    const remaining = placed.error.kind === "InventoryFull" ? placed.error.remaining : recipe.output.count;
    return err({ kind: "OutputWontFit", itemId: recipe.output.itemId, remaining });
  }
  return ok(placed.value);
}

export function canCraft(
  inventory: Inventory,
  recipe: Recipe,
  unlockedTier: number,
  nearbyStations: ReadonlySet<Station> = new Set(),
): Result<void, CraftError> {
  const r = attempt(inventory, recipe, unlockedTier, nearbyStations);
  return isOk(r) ? ok(undefined) : r;
}

export function doCraft(
  inventory: Inventory,
  recipe: Recipe,
  unlockedTier: number,
  nearbyStations: ReadonlySet<Station> = new Set(),
): Result<Inventory, CraftError> {
  return attempt(inventory, recipe, unlockedTier, nearbyStations);
}

export function craftableRecipes(
  inventory: Inventory,
  recipes: readonly Recipe[],
  unlockedTier: number,
  nearbyStations: ReadonlySet<Station> = new Set(),
): readonly Recipe[] {
  return recipes.filter((r) => isOk(canCraft(inventory, r, unlockedTier, nearbyStations)));
}

export interface IngredientStatus extends MissingIngredient {
  readonly satisfied: boolean;
}

/** Have/need per ingredient — the crafting screen's ingredient panel. */
export function ingredientStatus(
  inventory: Inventory,
  recipe: Recipe,
): readonly IngredientStatus[] {
  return recipe.ingredients.map((ing) => {
    const have = inventory.count(ing.itemId);
    return { itemId: ing.itemId, need: ing.count, have, satisfied: have >= ing.count };
  });
}
