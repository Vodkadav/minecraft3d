import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { Inventory } from "../inventory/Inventory";
import { ItemRegistry } from "../items/ItemRegistry";
import { decideAutoloot, type AutolootSettings } from "./Autoloot";
import { spawnGroundItem, type GroundItem } from "./GroundItem";

const REGISTRY = (() => {
  const r = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 10, tags: [], tier: 0 },
    { id: "stone", displayName: "Stone", maxStackSize: 10, tags: [], tier: 0 },
  ]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

function item(overrides: Partial<GroundItem> & { itemId: string; count: number }): GroundItem {
  return spawnGroundItem({
    id: overrides.id ?? `loot:${overrides.itemId}`,
    itemId: overrides.itemId,
    count: overrides.count,
    position: overrides.position ?? [0, 0, 0],
    spawnedAtMs: 0,
  });
}

const ON: AutolootSettings = { enabled: true, radiusM: 5 };
const ORIGIN: readonly [number, number, number] = [0, 0, 0];

describe("decideAutoloot", () => {
  it("disabled: leaves everything on the ground, untouched inventory", () => {
    const inv = Inventory.empty(REGISTRY, 4);
    const items = [item({ itemId: "wood", count: 3 })];
    const r = decideAutoloot({
      items,
      playerPosition: ORIGIN,
      inventory: inv,
      settings: { enabled: false, radiusM: 5 },
    });
    expect(r.pickedUp).toEqual([]);
    expect(r.leftBehind).toEqual(items);
    expect(r.bagFull).toBe(false);
    expect(r.inventory).toBe(inv);
  });

  it("fits: pulls the whole stack into the inventory", () => {
    const inv = Inventory.empty(REGISTRY, 4);
    const wood = item({ itemId: "wood", count: 3 });
    const r = decideAutoloot({ items: [wood], playerPosition: ORIGIN, inventory: inv, settings: ON });
    expect(r.pickedUp).toEqual([{ item: wood, count: 3 }]);
    expect(r.leftBehind).toEqual([]);
    expect(r.bagFull).toBe(false);
    expect(r.inventory.count("wood")).toBe(3);
  });

  it("out of range: skipped, left on the ground, not a bag-full case", () => {
    const inv = Inventory.empty(REGISTRY, 4);
    const far = item({ itemId: "wood", count: 3, position: [100, 0, 0] });
    const r = decideAutoloot({ items: [far], playerPosition: ORIGIN, inventory: inv, settings: ON });
    expect(r.pickedUp).toEqual([]);
    expect(r.leftBehind).toEqual([far]);
    expect(r.bagFull).toBe(false);
  });

  it("filtered out: skipped, left on the ground", () => {
    const inv = Inventory.empty(REGISTRY, 4);
    const stone = item({ itemId: "stone", count: 1 });
    const r = decideAutoloot({
      items: [stone],
      playerPosition: ORIGIN,
      inventory: inv,
      settings: ON,
      filter: (i) => i.itemId !== "stone",
    });
    expect(r.pickedUp).toEqual([]);
    expect(r.leftBehind).toEqual([stone]);
  });

  it("partial fit: pulls only what fits, leaves a reduced-count remainder, flags bagFull", () => {
    // capacity 1 slot, max stack 10 — pre-fill to 8, only 2 more wood fit
    const filled = Inventory.fromSlots(REGISTRY, [{ itemId: "wood", count: 8 }]);
    if (!isOk(filled)) throw new Error("setup failed");
    const wood = item({ itemId: "wood", count: 5 });
    const r = decideAutoloot({
      items: [wood],
      playerPosition: ORIGIN,
      inventory: filled.value,
      settings: ON,
    });
    expect(r.pickedUp).toEqual([{ item: wood, count: 2 }]);
    expect(r.leftBehind).toEqual([{ ...wood, count: 3 }]);
    expect(r.bagFull).toBe(true);
    expect(r.inventory.count("wood")).toBe(10);
  });

  it("completely full: nothing fits, left on the ground untouched, flags bagFull", () => {
    const full = Inventory.fromSlots(REGISTRY, [{ itemId: "wood", count: 10 }]);
    if (!isOk(full)) throw new Error("setup failed");
    const stone = item({ itemId: "stone", count: 1 });
    const r = decideAutoloot({
      items: [stone],
      playerPosition: ORIGIN,
      inventory: full.value,
      settings: ON,
    });
    expect(r.pickedUp).toEqual([]);
    expect(r.leftBehind).toEqual([stone]);
    expect(r.bagFull).toBe(true);
  });

  it("never conjures or discards: total item count is conserved across pickedUp+leftBehind", () => {
    const filled = Inventory.fromSlots(REGISTRY, [{ itemId: "wood", count: 9 }]);
    if (!isOk(filled)) throw new Error("setup failed");
    const wood = item({ itemId: "wood", count: 5 });
    const r = decideAutoloot({
      items: [wood],
      playerPosition: ORIGIN,
      inventory: filled.value,
      settings: ON,
    });
    const pickedTotal = r.pickedUp.reduce((n, p) => n + p.count, 0);
    const leftTotal = r.leftBehind.reduce((n, i) => n + i.count, 0);
    expect(pickedTotal + leftTotal).toBe(5);
  });

  it("multiple items: independent fit decisions in list order", () => {
    // slot0 is a full, mismatched stack (blocks any topping-up); slot1 is the
    // ONLY free room — enough for the first item, none left for the second.
    const filled = Inventory.fromSlots(REGISTRY, [{ itemId: "stone", count: 10 }, null]);
    if (!isOk(filled)) throw new Error("setup failed");
    const wood = item({ id: "a", itemId: "wood", count: 3 });
    const moreStone = item({ id: "b", itemId: "stone", count: 2 });
    const r = decideAutoloot({
      items: [wood, moreStone],
      playerPosition: ORIGIN,
      inventory: filled.value,
      settings: ON,
    });
    expect(r.pickedUp).toEqual([{ item: wood, count: 3 }]);
    expect(r.leftBehind).toEqual([moreStone]);
    expect(r.bagFull).toBe(true);
  });
});
