import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { resolveAoeCenter, scaleAbilityHits, type AbilityCastAim } from "./Ability";
import type { AbilitySpec } from "./AbilityRegistry";
import type { AoeSpec } from "./AoeRegistry";
import type { AoeHit } from "./Aoe";

const AOE: AoeSpec = { id: "test-aoe", radius: 4, falloff: "linear", blockSafe: true, vfx: "vfx.test" };

function aim(overrides: Partial<AbilityCastAim> = {}): AbilityCastAim {
  return { targeting: "selfAoe", origin: [1, 2, 3], ...overrides };
}

describe("resolveAoeCenter", () => {
  it("selfAoe centers on the caster's own origin", () => {
    const result = resolveAoeCenter(aim({ targeting: "selfAoe" }), AOE);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual([1, 2, 3]);
  });

  it("groundTarget centers on the claimed ground point", () => {
    const result = resolveAoeCenter(
      aim({ targeting: "groundTarget", groundPoint: [10, 0, -5] }),
      AOE,
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual([10, 0, -5]);
  });

  it("groundTarget without a groundPoint is a NoAim error", () => {
    const result = resolveAoeCenter(aim({ targeting: "groundTarget" }), AOE);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("NoAim");
  });

  it("cone centers half the aoe radius forward along dir", () => {
    const result = resolveAoeCenter(
      aim({ targeting: "cone", origin: [0, 0, 0], dir: [0, 0, 1] }),
      AOE, // radius 4 -> offset 2
    );
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual([0, 0, 2]);
  });

  it("cone without a dir is a NoAim error", () => {
    const result = resolveAoeCenter(aim({ targeting: "cone" }), AOE);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("NoAim");
  });

  it("projectile targeting never resolves an AoE center", () => {
    const result = resolveAoeCenter(aim({ targeting: "projectile", dir: [0, 0, 1] }), AOE);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("NotAoeTargeting");
  });
});

function abilitySpec(overrides: Partial<AbilitySpec> = {}): AbilitySpec {
  return {
    id: "test-spell",
    displayName: "Test Spell",
    targeting: "selfAoe",
    resourceCost: 10,
    cooldownMs: 1000,
    damageType: "nature",
    feelEvent: "heal",
    ...overrides,
  };
}

describe("scaleAbilityHits", () => {
  const hits: readonly AoeHit[] = [
    { id: "a", distance: 0, magnitude: 1 },
    { id: "b", distance: 2, magnitude: 0.5 },
  ];

  it("scales damage by each hit's falloff magnitude", () => {
    const scaled = scaleAbilityHits(abilitySpec({ damage: 10, healing: undefined }), hits);
    expect(scaled).toEqual([
      { id: "a", damage: 10, healing: 0 },
      { id: "b", damage: 5, healing: 0 },
    ]);
  });

  it("scales healing by each hit's falloff magnitude", () => {
    const scaled = scaleAbilityHits(abilitySpec({ healing: 20 }), hits);
    expect(scaled).toEqual([
      { id: "a", damage: 0, healing: 20 },
      { id: "b", damage: 0, healing: 10 },
    ]);
  });

  it("a spell with neither damage nor healing scales to all zeros, never NaN", () => {
    const scaled = scaleAbilityHits(abilitySpec(), hits);
    expect(scaled).toEqual([
      { id: "a", damage: 0, healing: 0 },
      { id: "b", damage: 0, healing: 0 },
    ]);
  });

  it("an empty hit list scales to an empty result", () => {
    expect(scaleAbilityHits(abilitySpec({ damage: 10 }), [])).toEqual([]);
  });
});
