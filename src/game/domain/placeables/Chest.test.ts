import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { CHEST_CAPACITY, createChestInventory } from "./Chest";

describe("Chest", () => {
  const registry = (() => {
    const r = ItemRegistry.create([{ id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 }]);
    if (!isOk(r)) throw new Error("registry setup failed");
    return r.value;
  })();

  it("creates an empty inventory at the chest capacity", () => {
    const inv = createChestInventory(registry);
    expect(inv.capacity).toBe(CHEST_CAPACITY);
    expect(inv.totalCount()).toBe(0);
  });

  it("accepts deposits like any inventory", () => {
    const inv = createChestInventory(registry);
    const r = inv.add("wood", 10);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.count("wood")).toBe(10);
  });
});
