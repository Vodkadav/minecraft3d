import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import type { Recipe } from "../crafting/Crafting";
import { Inventory } from "../inventory/Inventory";
import { ItemRegistry } from "../items/ItemRegistry";
import { filterRecipes, groupByTier, matchesSearch } from "./CraftingFilter";

const registry = (() => {
  const r = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 },
    { id: "plank", displayName: "Plank", maxStackSize: 64, tags: [], tier: 0 },
    { id: "ore", displayName: "Iron Ore", maxStackSize: 64, tags: [], tier: 1 },
    { id: "ingot", displayName: "Iron Ingot", maxStackSize: 64, tags: [], tier: 1 },
  ]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

const nameOf = (id: string): string => {
  const def = registry.get(id);
  return isOk(def) ? def.value.displayName : id;
};

const PLANKS: Recipe = {
  id: "planks",
  ingredients: [{ itemId: "wood", count: 1 }],
  output: { itemId: "plank", count: 4 },
  unlockTier: 0,
};
const INGOT: Recipe = {
  id: "ingot",
  ingredients: [{ itemId: "ore", count: 1 }],
  output: { itemId: "ingot", count: 1 },
  unlockTier: 1,
};

function invWith(entries: Array<[string, number]>): Inventory {
  let inv = Inventory.empty(registry, 27);
  for (const [id, n] of entries) {
    const r = inv.add(id, n);
    if (!isOk(r)) throw new Error("seed add failed");
    inv = r.value;
  }
  return inv;
}

describe("matchesSearch", () => {
  it("matches on the output item's name", () => {
    expect(matchesSearch(PLANKS, "plank", nameOf)).toBe(true);
    expect(matchesSearch(PLANKS, "PLANK", nameOf)).toBe(true);
  });

  it("matches on an ingredient's name", () => {
    expect(matchesSearch(INGOT, "ore", nameOf)).toBe(true);
  });

  it("empty query matches everything", () => {
    expect(matchesSearch(PLANKS, "", nameOf)).toBe(true);
    expect(matchesSearch(PLANKS, "   ", nameOf)).toBe(true);
  });

  it("no match returns false", () => {
    expect(matchesSearch(PLANKS, "dragon", nameOf)).toBe(false);
  });
});

describe("filterRecipes", () => {
  it("filters by search text", () => {
    const inv = invWith([]);
    const result = filterRecipes({
      recipes: [PLANKS, INGOT],
      inventory: inv,
      unlockedTier: 1,
      search: "ore",
      craftableOnly: false,
      nameOf,
    });
    expect(result.map((r) => r.id)).toEqual(["ingot"]);
  });

  it("filters to craftable-now when craftableOnly is set", () => {
    const inv = invWith([["wood", 1]]); // can craft planks, not ingot
    const result = filterRecipes({
      recipes: [PLANKS, INGOT],
      inventory: inv,
      unlockedTier: 1,
      search: "",
      craftableOnly: true,
      nameOf,
    });
    expect(result.map((r) => r.id)).toEqual(["planks"]);
  });

  it("locked recipes are excluded by craftableOnly even with ingredients", () => {
    const inv = invWith([["ore", 1]]);
    const result = filterRecipes({
      recipes: [INGOT],
      inventory: inv,
      unlockedTier: 0, // ingot needs tier 1
      search: "",
      craftableOnly: true,
      nameOf,
    });
    expect(result).toEqual([]);
  });

  it("combines search and craftableOnly", () => {
    const inv = invWith([["wood", 1], ["ore", 1]]);
    const result = filterRecipes({
      recipes: [PLANKS, INGOT],
      inventory: inv,
      unlockedTier: 0, // ingot locked
      search: "iron",
      craftableOnly: true,
      nameOf,
    });
    expect(result).toEqual([]);
  });
});

describe("groupByTier", () => {
  it("groups recipes under their unlockTier, ascending", () => {
    const grouped = groupByTier([INGOT, PLANKS]);
    expect([...grouped.keys()]).toEqual([0, 1]);
    expect(grouped.get(0)?.map((r) => r.id)).toEqual(["planks"]);
    expect(grouped.get(1)?.map((r) => r.id)).toEqual(["ingot"]);
  });
});
