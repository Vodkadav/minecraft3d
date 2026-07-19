import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { STARTER_ITEMS } from "../items/starterItems";
import { Inventory } from "./Inventory";
import { quickMove } from "./QuickMove";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

const HOTBAR_SIZE = 9;

describe("quickMove", () => {
  it("moves a backpack stack into the first empty hotbar slot", () => {
    const reg = registry();
    const empty = Inventory.empty(reg, 27);
    const added = empty.add("wood", 5); // lands in slot 0 (hotbar)
    if (!isOk(added)) throw new Error("setup");
    // put a second stack directly into a backpack slot via fromSlots
    const slots = added.value.slots.slice();
    slots[10] = { itemId: "stone", count: 3 };
    const withStone = Inventory.fromSlots(reg, slots);
    if (!isOk(withStone)) throw new Error("setup");

    const moved = quickMove(reg, withStone.value, 10, HOTBAR_SIZE);
    expect(isOk(moved)).toBe(true);
    if (!isOk(moved)) return;
    expect(moved.value.slots[10]).toBeNull();
    expect(moved.value.count("stone")).toBe(3);
    // ended up somewhere in the hotbar zone
    const inHotbar = moved.value.slots
      .slice(0, HOTBAR_SIZE)
      .some((s) => s?.itemId === "stone");
    expect(inHotbar).toBe(true);
  });

  it("moves a hotbar stack into the backpack zone", () => {
    const reg = registry();
    const empty = Inventory.empty(reg, 27);
    const added = empty.add("wood", 5); // slot 0, hotbar zone
    if (!isOk(added)) throw new Error("setup");

    const moved = quickMove(reg, added.value, 0, HOTBAR_SIZE);
    expect(isOk(moved)).toBe(true);
    if (!isOk(moved)) return;
    expect(moved.value.slots[0]).toBeNull();
    const inBackpack = moved.value.slots
      .slice(HOTBAR_SIZE)
      .some((s) => s?.itemId === "wood" && s.count === 5);
    expect(inBackpack).toBe(true);
  });

  it("merges into an existing compatible stack in the target zone", () => {
    const reg = registry();
    const empty = Inventory.empty(reg, 27);
    const slots = empty.slots.slice();
    slots[0] = { itemId: "wood", count: 4 }; // hotbar
    slots[9] = { itemId: "wood", count: 2 }; // backpack
    const inv = Inventory.fromSlots(reg, slots);
    if (!isOk(inv)) throw new Error("setup");

    const moved = quickMove(reg, inv.value, 0, HOTBAR_SIZE);
    expect(isOk(moved)).toBe(true);
    if (!isOk(moved)) return;
    expect(moved.value.slots[0]).toBeNull();
    expect(moved.value.slots[9]).toEqual({ itemId: "wood", count: 6 });
  });

  it("is a no-op when the opposite zone is completely full", () => {
    const reg = registry();
    const slots: Array<{ itemId: string; count: number } | null> = Array.from(
      { length: 27 },
      () => null,
    );
    for (let i = 0; i < HOTBAR_SIZE; i++) slots[i] = { itemId: "stone", count: 64 };
    slots[10] = { itemId: "wood", count: 1 };
    const inv = Inventory.fromSlots(reg, slots);
    if (!isOk(inv)) throw new Error("setup");

    const moved = quickMove(reg, inv.value, 10, HOTBAR_SIZE);
    expect(isOk(moved)).toBe(true);
    if (!isOk(moved)) return;
    expect(moved.value.slots[10]).toEqual({ itemId: "wood", count: 1 });
  });

  it("errors on an empty source slot", () => {
    const reg = registry();
    const inv = Inventory.empty(reg, 27);
    const moved = quickMove(reg, inv, 3, HOTBAR_SIZE);
    expect(isOk(moved)).toBe(false);
  });

  it("errors on an out-of-range index", () => {
    const reg = registry();
    const inv = Inventory.empty(reg, 27);
    const moved = quickMove(reg, inv, 99, HOTBAR_SIZE);
    expect(isOk(moved)).toBe(false);
  });
});
