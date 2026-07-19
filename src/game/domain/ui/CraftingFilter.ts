/**
 * Pure crafting-screen view logic (Workstream 4, task 4.2): the search
 * predicate, the "craftable now" filter, and tier grouping the recipe
 * browser renders from. Name lookup is injected (`nameOf`) rather than
 * imported from the i18n/application layer, so this stays pure domain and
 * the UI can search against the player's active locale.
 */

import { isOk } from "../Result";
import { canCraft, type Recipe } from "../crafting/Crafting";
import type { Inventory } from "../inventory/Inventory";

export type NameOf = (itemId: string) => string;

export function matchesSearch(recipe: Recipe, query: string, nameOf: NameOf): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const names = [recipe.output.itemId, ...recipe.ingredients.map((i) => i.itemId)].map((id) =>
    nameOf(id).toLowerCase(),
  );
  return names.some((n) => n.includes(q));
}

export interface RecipeFilterInput {
  readonly recipes: readonly Recipe[];
  readonly inventory: Inventory;
  readonly unlockedTier: number;
  readonly search: string;
  readonly craftableOnly: boolean;
  readonly nameOf: NameOf;
}

export function filterRecipes(input: RecipeFilterInput): readonly Recipe[] {
  return input.recipes.filter((r) => {
    if (!matchesSearch(r, input.search, input.nameOf)) return false;
    if (input.craftableOnly && !isOk(canCraft(input.inventory, r, input.unlockedTier))) {
      return false;
    }
    return true;
  });
}

/** Groups recipes by `unlockTier`, ascending — the browser's section order. */
export function groupByTier(recipes: readonly Recipe[]): ReadonlyMap<number, readonly Recipe[]> {
  const map = new Map<number, Recipe[]>();
  for (const r of recipes) {
    const arr = map.get(r.unlockTier) ?? [];
    arr.push(r);
    map.set(r.unlockTier, arr);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a - b));
}
