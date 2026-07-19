/**
 * Graph-integrity test for the content-depth gate (Workstream 7.1): the
 * registries must meet the numeric gates AND every item must be reachable —
 * either a gatherable ("natural"-tagged) root, or producible by some chain of
 * recipes rooted in gatherable items. No orphan recipe, no unreachable unlock.
 */

import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { STARTER_ITEMS } from "../items/starterItems";
import { STARTER_RECIPES } from "./starterRecipes";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("STARTER_ITEMS has a duplicate id");
  return r.value;
}

describe("content-depth gate (Workstream 7.1)", () => {
  it("has at least 40 items and 25 recipes", () => {
    expect(STARTER_ITEMS.length).toBeGreaterThanOrEqual(40);
    expect(STARTER_RECIPES.length).toBeGreaterThanOrEqual(25);
  });

  it("has no duplicate item ids", () => {
    expect(isOk(ItemRegistry.create(STARTER_ITEMS))).toBe(true);
  });

  it("has no duplicate recipe ids", () => {
    const ids = STARTER_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("recipe graph reachability", () => {
  const items = registry();

  it("every recipe references only known item ids", () => {
    for (const r of STARTER_RECIPES) {
      for (const ing of r.ingredients) {
        expect(items.has(ing.itemId), `recipe ${r.id} ingredient ${ing.itemId}`).toBe(true);
      }
      expect(items.has(r.output.itemId), `recipe ${r.id} output ${r.output.itemId}`).toBe(true);
    }
  });

  it("every item is a gatherable root or reachable by a recipe chain from roots", () => {
    const roots = new Set(items.byTag("natural").map((d) => d.id));
    const reachable = new Set(roots);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of STARTER_RECIPES) {
        if (reachable.has(r.output.itemId)) continue;
        if (r.ingredients.every((ing) => reachable.has(ing.itemId))) {
          reachable.add(r.output.itemId);
          changed = true;
        }
      }
    }
    const unreachable = items.all().filter((d) => !reachable.has(d.id)).map((d) => d.id);
    expect(unreachable).toEqual([]);
  });

  it("every recipe's ingredients are themselves reachable (no orphan unlock)", () => {
    const roots = new Set(items.byTag("natural").map((d) => d.id));
    const producedBy = new Map<string, string>();
    for (const r of STARTER_RECIPES) producedBy.set(r.output.itemId, r.id);
    for (const r of STARTER_RECIPES) {
      for (const ing of r.ingredients) {
        const isReachable = roots.has(ing.itemId) || producedBy.has(ing.itemId);
        expect(isReachable, `recipe ${r.id} needs ${ing.itemId} which nothing produces`).toBe(true);
      }
    }
  });
});
