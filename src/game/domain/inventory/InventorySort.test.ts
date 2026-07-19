import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { Inventory, type Slot } from "./Inventory";
import { ItemRegistry } from "../items/ItemRegistry";
import { STARTER_ITEMS } from "../items/starterItems";
import { autosort, compareStacks, type SortKey } from "./InventorySort";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

function invWith(reg: ItemRegistry, entries: Array<[number, string, number]>, capacity = 27): Inventory {
  const slots: Slot[] = Array.from({ length: capacity }, () => null);
  for (const [i, id, n] of entries) slots[i] = { itemId: id, count: n };
  const r = Inventory.fromSlots(reg, slots);
  if (!isOk(r)) throw new Error("bad inventory setup");
  return r.value;
}

function occupied(inv: Inventory): Array<{ itemId: string; count: number }> {
  return inv.slots.filter((s): s is { itemId: string; count: number } => s !== null);
}

describe("compareStacks", () => {
  it("orders by tier ascending, tie-broken by name", () => {
    const reg = registry();
    const cmp = compareStacks(reg, "tier");
    // wood/stone/plank/stick are tier 0; ore/ingot/pickaxe are tier 1
    expect(cmp({ itemId: "ore", count: 1 }, { itemId: "wood", count: 1 })).toBeGreaterThan(0);
    // same tier (0) -> tie-break on name: "Stone" < "Wood"
    expect(cmp({ itemId: "stone", count: 1 }, { itemId: "wood", count: 1 })).toBeLessThan(0);
  });

  it("orders by name alphabetically", () => {
    const reg = registry();
    const cmp = compareStacks(reg, "name");
    expect(cmp({ itemId: "wood", count: 1 }, { itemId: "stone", count: 1 })).toBeGreaterThan(0); // "Wood" > "Stone"
    expect(cmp({ itemId: "stone", count: 1 }, { itemId: "wood", count: 1 })).toBeLessThan(0);
  });

  it("orders by count descending", () => {
    const reg = registry();
    const cmp = compareStacks(reg, "count");
    expect(cmp({ itemId: "wood", count: 10 }, { itemId: "stone", count: 2 })).toBeLessThan(0);
  });

  it("orders by tag alphabetically", () => {
    const reg = registry();
    const cmp = compareStacks(reg, "tag");
    // wood/stone tag "natural"; plank/stick tag "crafted" -> crafted < natural
    expect(cmp({ itemId: "plank", count: 1 }, { itemId: "wood", count: 1 })).toBeLessThan(0);
  });
});

describe("autosort", () => {
  it("returns an empty inventory unchanged", () => {
    const reg = registry();
    const inv = Inventory.empty(reg, 27);
    const sorted = autosort(reg, inv, "tier");
    expect(occupied(sorted)).toHaveLength(0);
    expect(sorted.capacity).toBe(27);
  });

  it("merges every partial stack of the same item into the fewest full stacks", () => {
    const reg = registry();
    // wood maxStackSize is 64; 5 partial stacks totalling 130 -> ceil(130/64) = 3 stacks
    const inv = invWith(reg, [
      [0, "wood", 20],
      [3, "wood", 20],
      [7, "wood", 20],
      [12, "wood", 20],
      [20, "wood", 50],
    ]);
    expect(inv.totalCount()).toBe(130); // sanity: input actually has 130 wood
    const sorted = autosort(reg, inv, "tier");
    const woodStacks = occupied(sorted).filter((s) => s.itemId === "wood");
    expect(woodStacks).toHaveLength(3);
    expect(woodStacks.reduce((n, s) => n + s.count, 0)).toBe(130);
    expect(woodStacks.every((s) => s.count <= 64)).toBe(true);
  });

  it("compacts all-same-item stacks to the minimum slot count deterministically regardless of input order", () => {
    const reg = registry();
    const forward = invWith(reg, [
      [0, "stone", 1],
      [1, "stone", 1],
      [2, "stone", 1],
    ]);
    const shuffled = invWith(reg, [
      [10, "stone", 1],
      [5, "stone", 1],
      [26, "stone", 1],
    ]);
    const sortedForward = autosort(reg, forward, "name");
    const sortedShuffled = autosort(reg, shuffled, "name");
    expect(sortedForward.slots).toEqual(sortedShuffled.slots);
    expect(occupied(sortedForward)).toEqual([{ itemId: "stone", count: 3 }]);
  });

  it("preserves total counts across a full bag with many distinct items", () => {
    const reg = registry();
    // pickaxe caps at maxStackSize 1 — every other id here allows 64+.
    const ids = ["wood", "stone", "ore", "plank", "ingot", "stick", "pickaxe", "meat", "berries", "hide"];
    const entries: Array<[number, string, number]> = ids.map((id, i) => [i, id, id === "pickaxe" ? 1 : i + 1]);
    const inv = invWith(reg, entries, 27);
    const totalBefore = inv.totalCount();
    const sorted = autosort(reg, inv, "name");
    expect(sorted.totalCount()).toBe(totalBefore);
    expect(sorted.capacity).toBe(27);
  });

  it("orders slots deterministically by the requested key", () => {
    const reg = registry();
    const inv = invWith(reg, [
      [0, "wood", 1],
      [1, "stone", 1],
    ]);
    const sorted = autosort(reg, inv, "name");
    // "Stone" < "Wood" alphabetically
    expect(sorted.slots[0]).toEqual({ itemId: "stone", count: 1 });
    expect(sorted.slots[1]).toEqual({ itemId: "wood", count: 1 });
  });

  it("every sort key produces a stable ordering when run twice on the same input", () => {
    const reg = registry();
    const inv = invWith(reg, [
      [4, "ore", 3],
      [1, "wood", 9],
      [9, "meat", 2],
    ]);
    const keys: SortKey[] = ["tier", "tag", "name", "count"];
    for (const key of keys) {
      const a = autosort(reg, inv, key);
      const b = autosort(reg, inv, key);
      expect(a.slots).toEqual(b.slots);
    }
  });
});
