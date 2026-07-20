import { describe, expect, it } from "vitest";
import { canAffordCast, resolveAbilityHits, resolveCastCenter } from "./Ability";
import type { AbilitySpec } from "./AbilityRegistry";
import type { AoeSpec } from "./AoeRegistry";
import { isErr, isOk } from "../Result";

const sparkleBolt: AbilitySpec = {
  id: "sparkle-bolt",
  displayName: "Sparkle Bolt",
  targeting: "projectile",
  resourceCost: 15,
  cooldownMs: 800,
  damage: 12,
  projectile: "sparkle-bolt",
  damageType: "spark",
  feelEvent: "spellSpark",
};

const frostPuff: AbilitySpec = {
  id: "frost-puff",
  displayName: "Frost Puff",
  targeting: "cone",
  resourceCost: 20,
  cooldownMs: 3000,
  aoe: "frost-puff-cone",
  damageType: "frost",
  feelEvent: "spellFrost",
};

const healingBloom: AbilitySpec = {
  id: "healing-bloom",
  displayName: "Healing Bloom",
  targeting: "selfAoe",
  resourceCost: 30,
  cooldownMs: 6000,
  healing: 25,
  aoe: "healing-bloom",
  damageType: "nature",
  feelEvent: "spellNature",
};

const vineSnare: AbilitySpec = {
  id: "vine-snare",
  displayName: "Vine Snare",
  targeting: "groundTarget",
  resourceCost: 18,
  cooldownMs: 4000,
  aoe: "vine-snare-root",
  damageType: "nature",
  feelEvent: "spellNature",
};

const coneAoe: AoeSpec = { id: "frost-puff-cone", radius: 3, falloff: "linear", blockSafe: true, vfx: "vfx.frost.puff" };
const selfAoe: AoeSpec = { id: "healing-bloom", radius: 5, falloff: "linear", blockSafe: true, vfx: "vfx.nature.bloom" };
const groundAoe: AoeSpec = { id: "vine-snare-root", radius: 2, falloff: "none", blockSafe: true, vfx: "vfx.nature.vine" };

describe("canAffordCast", () => {
  it("true iff focus covers resourceCost", () => {
    expect(canAffordCast(sparkleBolt, 15)).toBe(true);
    expect(canAffordCast(sparkleBolt, 14)).toBe(false);
  });
});

describe("resolveCastCenter", () => {
  it("selfAoe centers on the caster's own origin", () => {
    const r = resolveCastCenter(healingBloom, [1, 2, 3], undefined, undefined);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("groundTarget centers on the claimed ground point", () => {
    const r = resolveCastCenter(vineSnare, [0, 0, 0], undefined, [5, 0, 5]);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual({ x: 5, y: 0, z: 5 });
  });

  it("groundTarget without a groundPoint is rejected", () => {
    const r = resolveCastCenter(vineSnare, [0, 0, 0], undefined, undefined);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("MissingGroundPoint");
  });

  it("cone projects forward from origin along dir by a short cozy reach", () => {
    const r = resolveCastCenter(frostPuff, [0, 0, 0], [1, 0, 0], undefined);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.x).toBeGreaterThan(0);
      expect(r.value.y).toBe(0);
      expect(r.value.z).toBe(0);
    }
  });

  it("cone without a dir is rejected", () => {
    const r = resolveCastCenter(frostPuff, [0, 0, 0], undefined, undefined);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("MissingDirection");
  });
});

describe("resolveAbilityHits", () => {
  it("healing bloom heals targets in radius, scaled by falloff, nearest first", () => {
    const targets = [
      { id: "ally-far", x: 4, y: 0, z: 0 },
      { id: "self", x: 0, y: 0, z: 0 },
    ];
    const r = resolveAbilityHits(healingBloom, selfAoe, { x: 0, y: 0, z: 0 }, targets);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.map((h) => h.id)).toEqual(["self", "ally-far"]);
      expect(r.value[0]!.amount).toBe(25); // full magnitude at center
      expect(r.value[1]!.amount).toBeLessThan(25);
      expect(r.value[1]!.amount).toBeGreaterThan(0);
    }
  });

  it("a spec with neither damage nor healing (pure control effect) resolves a zero amount", () => {
    const targets = [{ id: "creature-1", x: 0, y: 0, z: 0 }];
    const r = resolveAbilityHits(vineSnare, groundAoe, { x: 0, y: 0, z: 0 }, targets);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]!.amount).toBe(0);
    }
  });

  it("propagates the underlying resolveAoe error on an invalid center", () => {
    const r = resolveAbilityHits(healingBloom, selfAoe, { x: NaN, y: 0, z: 0 }, []);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("InvalidCenter");
  });

  it("targets outside the radius are excluded", () => {
    const targets = [{ id: "too-far", x: 999, y: 0, z: 0 }];
    const r = resolveAbilityHits(healingBloom, selfAoe, { x: 0, y: 0, z: 0 }, targets);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toHaveLength(0);
  });

  it("frost puff's cone AoE hits a creature standing at the projected center", () => {
    const center = resolveCastCenter(frostPuff, [0, 0, 0], [1, 0, 0], undefined);
    if (!isOk(center)) throw new Error("expected ok center");
    const targets = [{ id: "creature-1", ...center.value }];
    const r = resolveAbilityHits(frostPuff, coneAoe, center.value, targets);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]!.amount).toBe(0); // no damage field — pure control effect
    }
  });
});
