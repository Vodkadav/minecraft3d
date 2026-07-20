import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import type { ItemDefinition } from "../items/ItemDefinition";
import { Inventory } from "../inventory/Inventory";
import type { AbilitySpec } from "../combat/AbilityRegistry";
import {
  ACTION_BAR_SIZE,
  actionBarIndexForDigit,
  buildAbilitySlots,
  buildConsumableSlots,
  initialActionBarVisibility,
  toggleActionBarVisibility,
} from "./ActionBarState";

const ABILITIES: readonly AbilitySpec[] = [
  {
    id: "sparkle-bolt",
    displayName: "Sparkle Bolt",
    targeting: "projectile",
    resourceCost: 15,
    cooldownMs: 700,
    damage: 8,
    projectile: "sparkle-bolt",
    damageType: "spark",
    feelEvent: "spellSpark",
  },
  {
    id: "healing-bloom",
    displayName: "Healing Bloom",
    targeting: "selfAoe",
    resourceCost: 30,
    cooldownMs: 6000,
    healing: 20,
    aoe: "healing-bloom",
    damageType: "nature",
    feelEvent: "heal",
  },
];

const ITEMS: readonly ItemDefinition[] = [
  { id: "berry", displayName: "Berry", maxStackSize: 20, tags: ["food"], tier: 0, food: { hungerRestore: 4, healthRestore: 0 } },
  { id: "wood", displayName: "Wood", maxStackSize: 64, tags: ["material"], tier: 0 },
  { id: "roast", displayName: "Roast Meat", maxStackSize: 20, tags: ["food"], tier: 1, food: { hungerRestore: 10, healthRestore: 2 } },
];

function registry(): ItemRegistry {
  const r = ItemRegistry.create(ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("ActionBarState visibility", () => {
  it("starts hidden", () => {
    expect(initialActionBarVisibility().visible).toBe(false);
  });

  it("toggles", () => {
    const shown = toggleActionBarVisibility(initialActionBarVisibility());
    expect(shown.visible).toBe(true);
    expect(toggleActionBarVisibility(shown).visible).toBe(false);
  });
});

describe("buildAbilitySlots", () => {
  it("maps ability specs to ability slots, ready by default", () => {
    const slots = buildAbilitySlots(ABILITIES);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ id: "sparkle-bolt", kind: "ability", displayName: "Sparkle Bolt", readyFraction: 1 });
    expect(slots[0]?.itemId).toBeUndefined();
    expect(slots[0]?.count).toBeUndefined();
  });

  it("applies a readyFractions override, clamped 0..1", () => {
    const slots = buildAbilitySlots(ABILITIES, new Map([["sparkle-bolt", 0.4], ["healing-bloom", 5]]));
    expect(slots[0]?.readyFraction).toBe(0.4);
    expect(slots[1]?.readyFraction).toBe(1);
  });

  it("caps at ACTION_BAR_SIZE", () => {
    const many: AbilitySpec[] = Array.from({ length: ACTION_BAR_SIZE + 3 }, (_, i) => ({
      ...ABILITIES[0]!,
      id: `spell-${i}`,
    }));
    expect(buildAbilitySlots(many)).toHaveLength(ACTION_BAR_SIZE);
  });
});

describe("buildConsumableSlots", () => {
  it("only includes food-tagged items, dedup'd with summed counts", () => {
    const reg = registry();
    let inv = Inventory.empty(reg, 27);
    inv = unwrapAdd(inv.add("berry", 3));
    inv = unwrapAdd(inv.add("wood", 5));
    inv = unwrapAdd(inv.add("berry", 2)); // second stack, same item
    const slots = buildConsumableSlots(inv, reg);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ id: "berry", kind: "consumable", itemId: "berry", count: 5, displayName: "Berry" });
  });

  it("preserves first-seen order across distinct food items", () => {
    const reg = registry();
    let inv = Inventory.empty(reg, 27);
    inv = unwrapAdd(inv.add("roast", 1));
    inv = unwrapAdd(inv.add("berry", 1));
    const slots = buildConsumableSlots(inv, reg);
    expect(slots.map((s) => s.id)).toEqual(["roast", "berry"]);
  });

  it("caps at the given max", () => {
    const reg = registry();
    let inv = Inventory.empty(reg, 27);
    inv = unwrapAdd(inv.add("berry", 1));
    inv = unwrapAdd(inv.add("roast", 1));
    expect(buildConsumableSlots(inv, reg, 1)).toHaveLength(1);
  });

  it("returns an empty list for an inventory with no food items", () => {
    const reg = registry();
    let inv = Inventory.empty(reg, 27);
    inv = unwrapAdd(inv.add("wood", 5));
    expect(buildConsumableSlots(inv, reg)).toEqual([]);
  });
});

describe("actionBarIndexForDigit", () => {
  it("maps digits 1-9 to indices 0-8", () => {
    expect(actionBarIndexForDigit(1)).toBe(0);
    expect(actionBarIndexForDigit(9)).toBe(8);
  });

  it("rejects out-of-range/non-integer digits", () => {
    expect(actionBarIndexForDigit(0)).toBeNull();
    expect(actionBarIndexForDigit(10)).toBeNull();
    expect(actionBarIndexForDigit(1.5)).toBeNull();
  });
});

function unwrapAdd(r: ReturnType<Inventory["add"]>): Inventory {
  if (!isOk(r)) throw new Error("add failed");
  return r.value;
}
