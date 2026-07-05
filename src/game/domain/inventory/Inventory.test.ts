import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { Inventory } from "./Inventory";

const registry = (() => {
  const r = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 },
    { id: "stone", displayName: "Stone", maxStackSize: 16, tags: [], tier: 0 },
    { id: "pickaxe", displayName: "Pickaxe", maxStackSize: 1, tags: [], tier: 0 },
  ]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

function empty(capacity = 4): Inventory {
  return Inventory.empty(registry, capacity);
}

function added(inv: Inventory, itemId: string, count: number): Inventory {
  const r = inv.add(itemId, count);
  if (!isOk(r)) throw new Error(`add ${itemId}x${count} failed`);
  return r.value;
}

describe("Inventory", () => {
  it("starts empty with the given capacity", () => {
    const inv = empty(4);
    expect(inv.capacity).toBe(4);
    expect(inv.totalCount()).toBe(0);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it("adds items into the first slot", () => {
    const inv = added(empty(), "wood", 10);
    expect(inv.count("wood")).toBe(10);
    expect(inv.slots[0]).toEqual({ itemId: "wood", count: 10 });
  });

  it("stacks up to maxStackSize then overflows into the next slot", () => {
    const inv = added(empty(), "stone", 20); // stone max = 16
    expect(inv.slots[0]).toEqual({ itemId: "stone", count: 16 });
    expect(inv.slots[1]).toEqual({ itemId: "stone", count: 4 });
    expect(inv.count("stone")).toBe(20);
  });

  it("fills an existing partial stack before opening a new slot", () => {
    const inv = added(added(empty(), "stone", 10), "stone", 3);
    expect(inv.slots[0]).toEqual({ itemId: "stone", count: 13 });
    expect(inv.slots[1]).toBe(null);
  });

  it("rejects an add that does not fully fit and leaves state unchanged", () => {
    const inv = empty(1); // one slot, wood max 64
    const r = inv.add("wood", 100);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe("InventoryFull");
      if (r.error.kind === "InventoryFull") expect(r.error.remaining).toBe(36);
    }
    expect(inv.totalCount()).toBe(0);
  });

  it("rejects adding an unknown item", () => {
    const r = empty().add("mithril", 1);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownItem");
  });

  it("removes items across stacks", () => {
    const inv = added(empty(), "stone", 20); // 16 + 4
    const r = inv.remove("stone", 18);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.count("stone")).toBe(2);
  });

  it("rejects removing more than held", () => {
    const inv = added(empty(), "wood", 5);
    const r = inv.remove("wood", 6);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe("NotEnoughItems");
      if (r.error.kind === "NotEnoughItems") {
        expect(r.error.have).toBe(5);
        expect(r.error.want).toBe(6);
      }
    }
  });

  it("has() answers count queries", () => {
    const inv = added(empty(), "wood", 5);
    expect(inv.has("wood", 5)).toBe(true);
    expect(inv.has("wood", 6)).toBe(false);
    expect(inv.has("stone", 1)).toBe(false);
  });

  it("splits a stack into an empty slot", () => {
    const inv = added(empty(), "wood", 10);
    const r = inv.split(0, 4);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.slots[0]).toEqual({ itemId: "wood", count: 6 });
      expect(r.value.slots[1]).toEqual({ itemId: "wood", count: 4 });
    }
  });

  it("rejects a split of the whole (or more of the) stack", () => {
    const inv = added(empty(), "wood", 10);
    expect(isErr(inv.split(0, 10))).toBe(true);
    expect(isErr(inv.split(0, 0))).toBe(true);
    const full = inv.split(0, 12);
    expect(isErr(full)).toBe(true);
    if (isErr(full)) expect(full.error.kind).toBe("InvalidSplit");
  });

  it("rejects a split when no empty slot is available", () => {
    let inv = empty(2);
    inv = added(inv, "wood", 5);
    inv = added(inv, "stone", 5);
    const r = inv.split(0, 2);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("InventoryFull");
  });

  it("merges two stacks of the same item, respecting max", () => {
    let inv = empty(2);
    inv = added(inv, "stone", 10);
    // force a second partial stack in slot 1 by splitting
    const split = inv.split(0, 4);
    if (!isOk(split)) throw new Error("split setup");
    const merged = split.value.merge(1, 0);
    expect(isOk(merged)).toBe(true);
    if (isOk(merged)) {
      expect(merged.value.slots[0]).toEqual({ itemId: "stone", count: 10 });
      expect(merged.value.slots[1]).toBe(null);
    }
  });

  it("rejects merging stacks of different items", () => {
    let inv = empty(2);
    inv = added(inv, "wood", 5);
    inv = added(inv, "stone", 5);
    const r = inv.merge(0, 1);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("SlotMismatch");
  });

  it("moves a stack into an empty slot", () => {
    const inv = added(empty(), "wood", 7);
    const r = inv.move(0, 3);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.slots[0]).toBe(null);
      expect(r.value.slots[3]).toEqual({ itemId: "wood", count: 7 });
    }
  });

  it("swaps when moving onto a different item", () => {
    let inv = empty(2);
    inv = added(inv, "wood", 3);
    inv = added(inv, "stone", 2);
    const r = inv.move(0, 1);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.slots[0]).toEqual({ itemId: "stone", count: 2 });
      expect(r.value.slots[1]).toEqual({ itemId: "wood", count: 3 });
    }
  });

  it("rejects operations on out-of-range or empty slots", () => {
    const inv = added(empty(2), "wood", 1);
    expect(isErr(inv.move(5, 0))).toBe(true);
    expect(isErr(inv.split(9, 1))).toBe(true);
    const emptySlot = inv.move(1, 0);
    expect(isErr(emptySlot)).toBe(true);
    if (isErr(emptySlot)) expect(emptySlot.error.kind).toBe("SlotEmpty");
  });
});
