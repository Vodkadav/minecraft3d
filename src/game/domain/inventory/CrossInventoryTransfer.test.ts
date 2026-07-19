import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { STARTER_ITEMS } from "../items/starterItems";
import { Inventory } from "./Inventory";
import { transferBetween } from "./CrossInventoryTransfer";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("transferBetween (two-grid container transfer)", () => {
  it("moves a full stack from one inventory into another (player -> chest)", () => {
    const reg = registry();
    const player = Inventory.empty(reg, 27).add("wood", 5);
    if (!isOk(player)) throw new Error("setup");
    const chest = Inventory.empty(reg, 12);

    const result = transferBetween(player.value, chest, 0);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.from.count("wood")).toBe(0);
    expect(result.value.to.count("wood")).toBe(5);
  });

  it("merges into an existing compatible stack in the destination", () => {
    const reg = registry();
    const player = Inventory.empty(reg, 27).add("wood", 5);
    if (!isOk(player)) throw new Error("setup");
    const chestSeed = Inventory.empty(reg, 12).add("wood", 10);
    if (!isOk(chestSeed)) throw new Error("setup");

    const result = transferBetween(player.value, chestSeed.value, 0);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.to.count("wood")).toBe(15);
  });

  it("fails and leaves both inventories unchanged when the destination is full", () => {
    const reg = registry();
    const player = Inventory.empty(reg, 27).add("wood", 5);
    if (!isOk(player)) throw new Error("setup");
    let chest = Inventory.empty(reg, 1);
    const fillChest = chest.add("stone", 64);
    if (!isOk(fillChest)) throw new Error("setup");
    chest = fillChest.value;

    const result = transferBetween(player.value, chest, 0);
    expect(isOk(result)).toBe(false);
    // originals untouched
    expect(player.value.count("wood")).toBe(5);
    expect(chest.count("stone")).toBe(64);
  });

  it("errors on an empty source slot", () => {
    const reg = registry();
    const player = Inventory.empty(reg, 27);
    const chest = Inventory.empty(reg, 12);
    const result = transferBetween(player, chest, 0);
    expect(isOk(result)).toBe(false);
  });

  it("errors on an out-of-range source index", () => {
    const reg = registry();
    const player = Inventory.empty(reg, 27);
    const chest = Inventory.empty(reg, 12);
    const result = transferBetween(player, chest, 999);
    expect(isOk(result)).toBe(false);
  });
});
