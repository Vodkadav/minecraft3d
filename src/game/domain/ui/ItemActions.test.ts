import { describe, expect, it } from "vitest";
import { itemActions } from "./ItemActions";

describe("itemActions", () => {
  it("empty slot: no actions at all", () => {
    expect(itemActions({ itemId: null, count: 0, tags: [], canQuickMove: true })).toEqual([]);
  });

  it("single item (count 1): split is present but disabled", () => {
    const actions = itemActions({ itemId: "wood", count: 1, tags: ["natural"], canQuickMove: false });
    const split = actions.find((a) => a.id === "split");
    expect(split).toEqual({ id: "split", labelKey: "contextMenu.action.split", enabled: false });
  });

  it("full stack (count > 1): split is present and enabled", () => {
    const actions = itemActions({ itemId: "wood", count: 64, tags: ["natural"], canQuickMove: false });
    const split = actions.find((a) => a.id === "split");
    expect(split?.enabled).toBe(true);
  });

  it("drop and info are always present and enabled for a non-empty slot", () => {
    const actions = itemActions({ itemId: "wood", count: 1, tags: [], canQuickMove: false });
    expect(actions.find((a) => a.id === "drop")).toEqual({
      id: "drop",
      labelKey: "contextMenu.action.drop",
      enabled: true,
    });
    expect(actions.find((a) => a.id === "info")).toEqual({
      id: "info",
      labelKey: "contextMenu.action.info",
      enabled: true,
    });
  });

  it("a food item offers Use; a non-food item does not", () => {
    const food = itemActions({ itemId: "meat", count: 1, tags: ["food"], canQuickMove: false });
    expect(food.some((a) => a.id === "use")).toBe(true);

    const notFood = itemActions({ itemId: "wood", count: 1, tags: ["natural"], canQuickMove: false });
    expect(notFood.some((a) => a.id === "use")).toBe(false);
  });

  it("a weapon item offers Equip; a non-weapon item does not", () => {
    const weapon = itemActions({ itemId: "iron-sword", count: 1, tags: ["tool", "weapon"], canQuickMove: false });
    expect(weapon.some((a) => a.id === "equip")).toBe(true);

    const notWeapon = itemActions({ itemId: "wood", count: 1, tags: ["natural"], canQuickMove: false });
    expect(notWeapon.some((a) => a.id === "equip")).toBe(false);
  });

  it("quickMove only appears when the grid has a hotbar/backpack zone", () => {
    const withZone = itemActions({ itemId: "wood", count: 1, tags: [], canQuickMove: true });
    expect(withZone.some((a) => a.id === "quickMove")).toBe(true);

    const withoutZone = itemActions({ itemId: "wood", count: 1, tags: [], canQuickMove: false });
    expect(withoutZone.some((a) => a.id === "quickMove")).toBe(false);
  });

  it("orders actions Use/Equip, Split, Quick Move, Drop, Info", () => {
    const actions = itemActions({
      itemId: "iron-sword",
      count: 3,
      tags: ["tool", "weapon", "food"],
      canQuickMove: true,
    });
    expect(actions.map((a) => a.id)).toEqual(["use", "equip", "split", "quickMove", "drop", "info"]);
  });

  it("a full food+weapon stack: every action is enabled", () => {
    const actions = itemActions({
      itemId: "iron-sword",
      count: 3,
      tags: ["tool", "weapon", "food"],
      canQuickMove: true,
    });
    expect(actions.every((a) => a.enabled)).toBe(true);
  });
});
