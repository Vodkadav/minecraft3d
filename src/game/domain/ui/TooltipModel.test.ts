import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import type { ItemDefinition } from "../items/ItemDefinition";
import { buildTooltipModel, RARITY_TIERS, type Translate } from "./TooltipModel";

const DEFS: readonly ItemDefinition[] = [
  { id: "wood", displayName: "Wood", maxStackSize: 64, tags: ["natural", "flammable"], tier: 0 },
  { id: "iron-sword", displayName: "Iron Sword", maxStackSize: 1, tags: ["tool", "weapon"], tier: 2 },
  { id: "torch", displayName: "Torch", maxStackSize: 64, tags: ["crafted", "placeable", "light"], tier: 0 },
  { id: "silver-ring", displayName: "Silver Ring", maxStackSize: 1, tags: ["crafted", "gear"], tier: 2 },
  { id: "coin", displayName: "Coin", maxStackSize: 64, tags: ["natural", "treasure"], tier: 0 },
  { id: "wheat-seed", displayName: "Wheat Seeds", maxStackSize: 64, tags: ["natural", "seed"], tier: 0 },
  { id: "ingot", displayName: "Iron Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 1 },
  { id: "mystery", displayName: "Mystery Thing", maxStackSize: 1, tags: [], tier: 0 },
  {
    id: "meat",
    displayName: "Cooked Meat",
    maxStackSize: 64,
    tags: ["crafted", "food"],
    tier: 0,
    food: { hungerRestore: 35, healthRestore: 8 },
  },
  {
    id: "berries",
    displayName: "Berries",
    maxStackSize: 64,
    tags: ["natural", "food"],
    tier: 0,
    food: { hungerRestore: 15, healthRestore: 0 },
  },
  {
    id: "bow",
    displayName: "Hunting Bow",
    maxStackSize: 1,
    tags: ["tool", "weapon", "crafted"],
    tier: 2,
    combat: {
      kind: "ranged",
      damage: 12,
      attackSpeed: 1.5,
      damageType: "physical",
      feelEvent: "bowFire",
    },
  },
  {
    id: "sword",
    displayName: "Steel Sword",
    maxStackSize: 1,
    tags: ["tool", "weapon", "crafted"],
    tier: 3,
    combat: {
      kind: "melee",
      damage: 18,
      attackSpeed: 1.2,
      reach: 2.5,
      damageType: "physical",
      feelEvent: "swordHit",
    },
  },
];

function registry(): ItemRegistry {
  const r = ItemRegistry.create(DEFS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

/** Mimics `domain/i18n/translate.ts`'s missing-key fallback (return the key
 *  itself) so tests can exercise the same displayName fallback the real
 *  Localizer produces. */
function fakeT(overrides: Record<string, string> = {}): Translate {
  return (key, params) => {
    const template = overrides[key];
    if (!template) return key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      params[name] === undefined ? whole : String(params[name]),
    );
  };
}

describe("buildTooltipModel", () => {
  it("returns an Err for an unknown item id", () => {
    const result = buildTooltipModel({ itemId: "nope", registry: registry(), t: fakeT() });
    expect(result.ok).toBe(false);
  });

  it("defaults rarityTier to common when no override is given", () => {
    const result = buildTooltipModel({ itemId: "wood", registry: registry(), t: fakeT() });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.rarityTier).toBe("common");
    expect(RARITY_TIERS).toContain(result.value.rarityTier);
  });

  it("honors a rarityTier override", () => {
    const result = buildTooltipModel({
      itemId: "wood",
      registry: registry(),
      t: fakeT(),
      rarityTier: "legendary",
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.rarityTier).toBe("legendary");
  });

  it("uses the localized item name when the catalog has one", () => {
    const t = fakeT({ "item.wood.name": "Bois" });
    const result = buildTooltipModel({ itemId: "wood", registry: registry(), t });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.name).toBe("Bois");
  });

  it("falls back to the registry displayName when no translation exists", () => {
    const result = buildTooltipModel({ itemId: "wood", registry: registry(), t: fakeT() });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.name).toBe("Wood");
  });

  it("passes tags through untouched for the renderer's icon lookup", () => {
    const result = buildTooltipModel({ itemId: "iron-sword", registry: registry(), t: fakeT() });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.tags).toEqual(["tool", "weapon"]);
  });

  it("carries the quantity through when given", () => {
    const result = buildTooltipModel({ itemId: "wood", registry: registry(), t: fakeT(), quantity: 12 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.quantity).toBe(12);
  });

  it("leaves quantity undefined when not given", () => {
    const result = buildTooltipModel({ itemId: "wood", registry: registry(), t: fakeT() });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.quantity).toBeUndefined();
  });

  it("passes pre-localized keyhints through when given", () => {
    const result = buildTooltipModel({
      itemId: "wood",
      registry: registry(),
      t: fakeT(),
      keyhints: ["Right-click to split the stack"],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.keyhints).toEqual(["Right-click to split the stack"]);
  });

  describe("category classification (mirrors ui/icons/ItemIconSpec priority order)", () => {
    it("weapon wins over tool when both tags are present", () => {
      const result = buildTooltipModel({ itemId: "iron-sword", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("weapon");
    });
    it("gear for armor/gear-tagged items", () => {
      const result = buildTooltipModel({ itemId: "silver-ring", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("gear");
    });
    it("treasure for treasure-tagged items", () => {
      const result = buildTooltipModel({ itemId: "coin", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("treasure");
    });
    it("seed for seed-tagged items", () => {
      const result = buildTooltipModel({ itemId: "wheat-seed", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("seed");
    });
    it("light for light-tagged items", () => {
      const result = buildTooltipModel({ itemId: "torch", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("light");
    });
    it("metal for metal-tagged items", () => {
      const result = buildTooltipModel({ itemId: "ingot", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("metal");
    });
    it("material for natural/crafted-only items", () => {
      const result = buildTooltipModel({ itemId: "wood", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("material");
    });
    it("misc for items with no classifying tag", () => {
      const result = buildTooltipModel({ itemId: "mystery", registry: registry(), t: fakeT() });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.category).toBe("misc");
    });
  });

  describe("rows", () => {
    it("always includes a category row first", () => {
      const t = fakeT({ "tooltip.row.category": "Category", "tooltip.category.material": "Material" });
      const result = buildTooltipModel({ itemId: "wood", registry: registry(), t });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.rows[0]).toEqual({ label: "Category", value: "Material" });
    });

    it("includes a tier row only when tier > 0", () => {
      const t = fakeT({ "tooltip.row.tier": "Tier" });
      const zeroTier = buildTooltipModel({ itemId: "wood", registry: registry(), t });
      const nonZeroTier = buildTooltipModel({ itemId: "ingot", registry: registry(), t });
      if (!zeroTier.ok || !nonZeroTier.ok) throw new Error("expected ok");
      expect(zeroTier.value.rows.some((r) => r.label === "Tier")).toBe(false);
      expect(nonZeroTier.value.rows).toContainEqual({ label: "Tier", value: "1" });
    });

    it("adds a hunger row (and a health row only when healthRestore > 0) for food items", () => {
      const t = fakeT({ "tooltip.row.hunger": "Hunger", "tooltip.row.health": "Health" });
      const meat = buildTooltipModel({ itemId: "meat", registry: registry(), t });
      const berries = buildTooltipModel({ itemId: "berries", registry: registry(), t });
      if (!meat.ok || !berries.ok) throw new Error("expected ok");
      expect(meat.value.rows).toContainEqual({ label: "Hunger", value: "+35" });
      expect(meat.value.rows).toContainEqual({ label: "Health", value: "+8" });
      expect(berries.value.rows).toContainEqual({ label: "Hunger", value: "+15" });
      expect(berries.value.rows.some((r) => r.label === "Health")).toBe(false);
    });

    it("never adds food rows for a non-food item", () => {
      const t = fakeT({ "tooltip.row.hunger": "Hunger" });
      const result = buildTooltipModel({ itemId: "wood", registry: registry(), t });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.rows.some((r) => r.label === "Hunger")).toBe(false);
    });

    it("adds damage/attackSpeed/damageType rows (and a reach row only when present) for weapons", () => {
      const t = fakeT({
        "tooltip.row.damage": "Damage",
        "tooltip.row.attackSpeed": "Attack Speed",
        "tooltip.row.damageType": "Damage Type",
        "tooltip.row.reach": "Reach",
        "tooltip.damageType.physical": "Physical",
      });
      const bow = buildTooltipModel({ itemId: "bow", registry: registry(), t });
      const sword = buildTooltipModel({ itemId: "sword", registry: registry(), t });
      if (!bow.ok || !sword.ok) throw new Error("expected ok");
      expect(bow.value.rows).toContainEqual({ label: "Damage", value: "12" });
      expect(bow.value.rows).toContainEqual({ label: "Attack Speed", value: "1.5" });
      expect(bow.value.rows).toContainEqual({ label: "Damage Type", value: "Physical" });
      expect(bow.value.rows.some((r) => r.label === "Reach")).toBe(false);
      expect(sword.value.rows).toContainEqual({ label: "Reach", value: "2.5" });
    });

    it("never adds combat rows for a non-weapon item", () => {
      const t = fakeT({ "tooltip.row.damage": "Damage" });
      const result = buildTooltipModel({ itemId: "wood", registry: registry(), t });
      if (!result.ok) throw new Error("expected ok");
      expect(result.value.rows.some((r) => r.label === "Damage")).toBe(false);
    });
  });
});
