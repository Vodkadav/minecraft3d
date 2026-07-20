import { describe, expect, it } from "vitest";
import { AOE_REGISTRY } from "./AoeRegistry";
import { PROJECTILE_REGISTRY } from "./ProjectileRegistry";
import { isErr, isOk } from "../Result";
import {
  ABILITY_REGISTRY,
  AbilityRegistry,
  STARTER_ABILITIES,
  type AbilitySpec,
} from "./AbilityRegistry";

function spec(overrides: Partial<AbilitySpec> = {}): AbilitySpec {
  return {
    id: "test-spell",
    displayName: "Test Spell",
    targeting: "projectile",
    resourceCost: 10,
    cooldownMs: 1000,
    damageType: "spark",
    feelEvent: "spellSpark",
    ...overrides,
  };
}

describe("AbilityRegistry", () => {
  it("looks up a defined ability by id", () => {
    const created = AbilityRegistry.create([spec()]);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    const found = created.value.get("test-spell");
    expect(isOk(found)).toBe(true);
    if (isOk(found)) expect(found.value.resourceCost).toBe(10);
  });

  it("returns UnknownAbility for an id that was never registered", () => {
    const created = AbilityRegistry.create([spec()]);
    if (!isOk(created)) throw new Error("setup");
    const found = created.value.get("ghost-spell");
    expect(isErr(found)).toBe(true);
    if (isErr(found)) expect(found.error.kind).toBe("UnknownAbility");
  });

  it("rejects a table with a duplicate id", () => {
    const created = AbilityRegistry.create([spec(), spec({ resourceCost: 20 })]);
    expect(isErr(created)).toBe(true);
    if (isErr(created)) expect(created.error.kind).toBe("DuplicateAbility");
  });

  it("reports membership with has() and exposes all()", () => {
    const created = AbilityRegistry.create([spec({ id: "a" }), spec({ id: "b" })]);
    if (!isOk(created)) throw new Error("setup");
    expect(created.value.has("a")).toBe(true);
    expect(created.value.has("nope")).toBe(false);
    expect(created.value.all().map((s) => s.id).sort()).toEqual(["a", "b"]);
  });
});

describe("starter ability table integrity", () => {
  it("constructs without a fallible unwrap (no duplicate ids in the starter table)", () => {
    expect(() => ABILITY_REGISTRY).not.toThrow();
  });

  it("every entry has sane cost/cooldown and resolvable projectile/aoe references", () => {
    for (const s of STARTER_ABILITIES) {
      expect(s.resourceCost).toBeGreaterThanOrEqual(0);
      expect(s.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(s.displayName.length).toBeGreaterThan(0);
      if (s.projectile !== undefined) {
        expect(PROJECTILE_REGISTRY.has(s.projectile), `ProjectileRegistry missing ${s.projectile}`).toBe(
          true,
        );
      }
      if (s.aoe !== undefined) {
        expect(AOE_REGISTRY.has(s.aoe), `AoeRegistry missing ${s.aoe}`).toBe(true);
      }
    }
  });
});
