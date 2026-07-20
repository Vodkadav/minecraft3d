import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { ItemDefinition, WeaponMetadata } from "../items/ItemDefinition";
import { WEAPON_REGISTRY, WeaponRegistry } from "./WeaponRegistry";

function weaponMeta(overrides: Partial<WeaponMetadata> = {}): WeaponMetadata {
  return {
    kind: "melee",
    damage: 10,
    attackSpeed: 1.5,
    damageType: "physical",
    feelEvent: "meleeSwing",
    ...overrides,
  };
}

function item(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: "test-sword",
    displayName: "Test Sword",
    maxStackSize: 1,
    tags: ["tool", "weapon"],
    tier: 1,
    ...overrides,
  };
}

describe("WeaponRegistry", () => {
  it("indexes only items carrying combat metadata", () => {
    const sword = item({ combat: weaponMeta() });
    const plank = item({ id: "plank", combat: undefined });
    const created = WeaponRegistry.create([sword, plank]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    expect(created.value.has("test-sword")).toBe(true);
    expect(created.value.has("plank")).toBe(false);
  });

  it("looks up a weapon's metadata by item id", () => {
    const created = WeaponRegistry.create([item({ combat: weaponMeta({ damage: 25 }) })]);
    if (!isOk(created)) throw new Error("setup");
    const found = created.value.get("test-sword");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.damage).toBe(25);
  });

  it("returns UnknownWeapon for a non-weapon or missing item id", () => {
    const created = WeaponRegistry.create([item({ combat: weaponMeta() }), item({ id: "plank" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(isErr(created.value.get("plank"))).toBe(true);
    expect(isErr(created.value.get("nope"))).toBe(true);
  });

  it("rejects a table with a duplicate weapon item id", () => {
    const created = WeaponRegistry.create([
      item({ combat: weaponMeta() }),
      item({ combat: weaponMeta({ damage: 99 }) }),
    ]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("DuplicateWeapon");
  });

  it("exposes all() as [itemId, metadata] pairs", () => {
    const created = WeaponRegistry.create([
      item({ id: "a", combat: weaponMeta() }),
      item({ id: "b", combat: weaponMeta({ kind: "ranged" }) }),
    ]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.all().map(([id]) => id).sort()).toEqual(["a", "b"]);
  });
});

describe("starter weapon table integrity (E7.1)", () => {
  it("constructs without a fallible unwrap (no duplicate weapon item ids in STARTER_ITEMS)", () => {
    expect(() => WEAPON_REGISTRY).not.toThrow();
  });

  it("has at least one melee weapon registered", () => {
    expect(WEAPON_REGISTRY.all().length).toBeGreaterThan(0);
    for (const [, meta] of WEAPON_REGISTRY.all()) {
      expect(["melee", "ranged", "thrown", "spell", "deployable"]).toContain(meta.kind);
    }
  });

  it("every entry has sane, positive combat parameters", () => {
    for (const [id, meta] of WEAPON_REGISTRY.all()) {
      expect(meta.damage, id).toBeGreaterThan(0);
      expect(meta.attackSpeed, id).toBeGreaterThan(0);
      if (meta.reach !== undefined) expect(meta.reach, id).toBeGreaterThan(0);
      if (meta.coneDegrees !== undefined) {
        expect(meta.coneDegrees, id).toBeGreaterThan(0);
        expect(meta.coneDegrees, id).toBeLessThanOrEqual(180);
      }
      expect(meta.feelEvent.length, id).toBeGreaterThan(0);
    }
  });
});
