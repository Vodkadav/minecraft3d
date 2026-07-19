import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { CHEST_CAPACITY, createChestInventory } from "./Chest";
import { depositToChest, withdrawFromChest, type ChestState } from "./ChestTransfer";

describe("ChestTransfer", () => {
  const registry = (() => {
    const r = ItemRegistry.create([
      { id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 },
    ]);
    if (!isOk(r)) throw new Error("registry setup failed");
    return r.value;
  })();

  function emptyChest(): ChestState {
    const inv = createChestInventory(registry);
    return { capacity: inv.capacity, slots: inv.slots };
  }

  it("deposits into an empty chest", () => {
    const r = depositToChest(emptyChest(), registry, "wood", 10);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.slots.some((s) => s?.itemId === "wood" && s.count === 10)).toBe(true);
  });

  it("rejects a deposit that overflows the chest", () => {
    let chest = emptyChest();
    for (let i = 0; i < CHEST_CAPACITY; i++) {
      const r = depositToChest(chest, registry, "wood", 64);
      if (!isOk(r)) throw new Error("setup deposit failed");
      chest = r.value;
    }
    const overflow = depositToChest(chest, registry, "wood", 1);
    expect(isErr(overflow)).toBe(true);
  });

  it("withdraws a stack, returning the item + count granted", () => {
    const deposited = depositToChest(emptyChest(), registry, "wood", 10);
    if (!isOk(deposited)) throw new Error("setup deposit failed");
    const r = withdrawFromChest(deposited.value, registry, "wood", 4);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.itemId).toBe("wood");
      expect(r.value.count).toBe(4);
      expect(r.value.chest.slots.find((s) => s?.itemId === "wood")?.count).toBe(6);
    }
  });

  it("rejects withdrawing more than the chest holds", () => {
    const r = withdrawFromChest(emptyChest(), registry, "wood", 1);
    expect(isErr(r)).toBe(true);
  });
});
