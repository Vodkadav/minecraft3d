import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { Inventory } from "../inventory/Inventory";
import { ItemRegistry } from "../items/ItemRegistry";
import {
  canCraft,
  craftableRecipes,
  doCraft,
  ingredientStatus,
  stationSatisfied,
  type Recipe,
} from "./Crafting";

const registry = (() => {
  const r = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 },
    { id: "plank", displayName: "Plank", maxStackSize: 64, tags: [], tier: 0 },
    { id: "stick", displayName: "Stick", maxStackSize: 64, tags: [], tier: 0 },
    { id: "ore", displayName: "Ore", maxStackSize: 64, tags: [], tier: 1 },
    { id: "ingot", displayName: "Ingot", maxStackSize: 64, tags: [], tier: 1 },
  ]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

const PLANKS: Recipe = {
  id: "planks",
  ingredients: [{ itemId: "wood", count: 1 }],
  output: { itemId: "plank", count: 4 },
  unlockTier: 0,
};

const STICKS: Recipe = {
  id: "sticks",
  ingredients: [{ itemId: "plank", count: 2 }],
  output: { itemId: "stick", count: 4 },
  unlockTier: 0,
};

const INGOT: Recipe = {
  id: "ingot",
  ingredients: [{ itemId: "ore", count: 1 }],
  output: { itemId: "ingot", count: 1 },
  unlockTier: 1,
};

function invWith(entries: Array<[string, number]>, capacity = 6): Inventory {
  let inv = Inventory.empty(registry, capacity);
  for (const [id, n] of entries) {
    const r = inv.add(id, n);
    if (!isOk(r)) throw new Error(`seed add failed ${id}`);
    inv = r.value;
  }
  return inv;
}

describe("crafting", () => {
  it("crafts when ingredients are present and tier is unlocked", () => {
    const inv = invWith([["wood", 3]]);
    const r = doCraft(inv, PLANKS, 0);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.count("wood")).toBe(2);
      expect(r.value.count("plank")).toBe(4);
    }
  });

  it("reports MissingIngredients when the inventory lacks an ingredient", () => {
    const inv = invWith([]);
    const r = doCraft(inv, PLANKS, 0);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe("MissingIngredients");
      if (r.error.kind === "MissingIngredients") {
        expect(r.error.missing).toEqual([{ itemId: "wood", need: 1, have: 0 }]);
      }
    }
  });

  it("reports Locked when the recipe tier exceeds the unlocked tier", () => {
    const inv = invWith([["ore", 1]]);
    const r = doCraft(inv, INGOT, 0);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe("Locked");
      if (r.error.kind === "Locked") {
        expect(r.error.requiredTier).toBe(1);
        expect(r.error.unlockedTier).toBe(0);
      }
    }
  });

  it("frees the ingredient slot so a modest output still fits", () => {
    // 1 slot holding the sole ingredient; consuming it frees the slot for output.
    const single = invWith([["wood", 1]], 1);
    const r = doCraft(single, PLANKS, 0);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.count("plank")).toBe(4);
  });

  it("reports OutputWontFit when the output cannot fit after consuming ingredients", () => {
    // slot 0: wood x1 (ingredient, frees to 1 slot), slot 1: stick x64 (blocker).
    // Output plank x200 needs 4 full slots — only 1 frees, so it overflows.
    const blocked: Recipe = {
      id: "blocked",
      ingredients: [{ itemId: "wood", count: 1 }],
      output: { itemId: "plank", count: 200 },
      unlockTier: 0,
    };
    const inv = invWith([["wood", 1], ["stick", 64]], 2);
    const r = doCraft(inv, blocked, 0);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("OutputWontFit");
    // rejection leaves the inventory untouched
    expect(inv.count("wood")).toBe(1);
    expect(inv.count("plank")).toBe(0);
  });

  it("canCraft mirrors doCraft success without consuming", () => {
    const inv = invWith([["wood", 1]]);
    expect(isOk(canCraft(inv, PLANKS, 0))).toBe(true);
    expect(isErr(canCraft(inv, INGOT, 0))).toBe(true);
    // inventory untouched
    expect(inv.count("wood")).toBe(1);
  });

  it("lists currently craftable recipes given inventory and tier", () => {
    const inv = invWith([["wood", 1], ["plank", 2], ["ore", 1]]);
    const all = [PLANKS, STICKS, INGOT];

    const atTier0 = craftableRecipes(inv, all, 0).map((r) => r.id).sort();
    expect(atTier0).toEqual(["planks", "sticks"]); // ingot is tier-locked

    const atTier1 = craftableRecipes(inv, all, 1).map((r) => r.id).sort();
    expect(atTier1).toEqual(["ingot", "planks", "sticks"]);
  });

  describe("station gating (Workstream 8.4)", () => {
    const COOK: Recipe = {
      id: "cook-meat",
      ingredients: [{ itemId: "wood", count: 1 }],
      output: { itemId: "plank", count: 1 },
      unlockTier: 0,
      station: "campfire",
    };

    it("rejects with StationRequired when the station is absent", () => {
      const inv = invWith([["wood", 1]]);
      const r = doCraft(inv, COOK, 0);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error).toEqual({ kind: "StationRequired", station: "campfire" });
    });

    it("succeeds once the required station is nearby", () => {
      const inv = invWith([["wood", 1]]);
      const r = doCraft(inv, COOK, 0, new Set(["campfire"]));
      expect(isOk(r)).toBe(true);
    });

    it("a station-less recipe is unaffected by nearbyStations", () => {
      const inv = invWith([["wood", 1]]);
      expect(isOk(doCraft(inv, PLANKS, 0))).toBe(true);
      expect(isOk(doCraft(inv, PLANKS, 0, new Set()))).toBe(true);
    });

    it("stationSatisfied mirrors the gate directly", () => {
      expect(stationSatisfied(COOK, new Set())).toBe(false);
      expect(stationSatisfied(COOK, new Set(["campfire"]))).toBe(true);
      expect(stationSatisfied(PLANKS, new Set())).toBe(true);
    });
  });

  describe("ingredientStatus", () => {
    it("reports have/need/satisfied per ingredient", () => {
      const inv = invWith([["plank", 1]]);
      const status = ingredientStatus(inv, STICKS);
      expect(status).toEqual([{ itemId: "plank", need: 2, have: 1, satisfied: false }]);
    });

    it("marks satisfied when the inventory has enough", () => {
      const inv = invWith([["plank", 2]]);
      const status = ingredientStatus(inv, STICKS);
      expect(status).toEqual([{ itemId: "plank", need: 2, have: 2, satisfied: true }]);
    });
  });
});
