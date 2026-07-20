import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { WeaponMetadata } from "../items/ItemDefinition";
import {
  DEFAULT_CONE_DEGREES,
  DEFAULT_REACH_M,
  MIN_CHARGE_DAMAGE_FRACTION,
  SWEEP_CONE_DEGREES,
  chargeDamageScale,
  chargeFraction,
  resolveMelee,
  type MeleeResolveInput,
  type MeleeTarget,
} from "./MeleeResolve";

function weapon(overrides: Partial<WeaponMetadata> = {}): WeaponMetadata {
  return {
    kind: "melee",
    damage: 10,
    attackSpeed: 1.5,
    reach: 4,
    coneDegrees: 60,
    damageType: "physical",
    feelEvent: "meleeSwing",
    ...overrides,
  };
}

function target(id: string, position: readonly [number, number]): MeleeTarget {
  return { id, position };
}

function input(overrides: Partial<MeleeResolveInput> = {}): MeleeResolveInput {
  return {
    weapon: weapon(),
    charge: 1,
    origin: [0, 0],
    dir: [0, 1],
    targets: [],
    ...overrides,
  };
}

describe("resolveMelee", () => {
  it("returns NoTarget with no candidates", () => {
    const r = resolveMelee(input());
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NoTarget");
  });

  it("returns NoTarget when every candidate is out of reach", () => {
    const r = resolveMelee(input({ targets: [target("far", [0, 10])] }));
    expect(isErr(r)).toBe(true);
  });

  it("returns NoTarget when a target is in reach but behind the player (outside the cone)", () => {
    const r = resolveMelee(input({ dir: [0, 1], targets: [target("behind", [0, -2])] }));
    expect(isErr(r)).toBe(true);
  });

  it("hits a target directly ahead, in reach and in the cone", () => {
    const r = resolveMelee(input({ dir: [0, 1], targets: [target("ahead", [0, 2])] }));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.map((h) => h.targetId)).toEqual(["ahead"]);
  });

  it("soft-locks the NEAREST of two targets in the arc for a narrow-cone weapon", () => {
    const r = resolveMelee(
      input({
        weapon: weapon({ coneDegrees: 60 }),
        dir: [0, 1],
        targets: [target("far", [0.2, 3.5]), target("near", [0.2, 1.5])],
      }),
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]!.targetId).toBe("near");
    }
  });

  it("a heavy sweep weapon (cone >= SWEEP_CONE_DEGREES) hits every target in the arc", () => {
    const r = resolveMelee(
      input({
        weapon: weapon({ coneDegrees: SWEEP_CONE_DEGREES, reach: 4 }),
        dir: [0, 1],
        targets: [target("left", [-1.5, 2]), target("right", [1.5, 2]), target("center", [0, 2])],
      }),
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.map((h) => h.targetId).sort()).toEqual(["center", "left", "right"]);
  });

  it("a narrow-cone weapon never multi-hits, even with several targets in its arc", () => {
    const r = resolveMelee(
      input({
        weapon: weapon({ coneDegrees: 60 }),
        dir: [0, 1],
        targets: [target("a", [0.1, 2]), target("b", [-0.1, 2])],
      }),
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toHaveLength(1);
  });

  it("scales damage down at partial charge, floored at MIN_CHARGE_DAMAGE_FRACTION", () => {
    const r = resolveMelee(
      input({ weapon: weapon({ damage: 20 }), charge: 0, dir: [0, 1], targets: [target("a", [0, 1])] }),
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value[0]!.damage).toBeCloseTo(20 * MIN_CHARGE_DAMAGE_FRACTION);
  });

  it("deals full weapon damage at full charge", () => {
    const r = resolveMelee(
      input({ weapon: weapon({ damage: 20 }), charge: 1, dir: [0, 1], targets: [target("a", [0, 1])] }),
    );
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value[0]!.damage).toBe(20);
  });

  it("clamps an out-of-range charge instead of extrapolating damage", () => {
    const over = resolveMelee(
      input({ weapon: weapon({ damage: 20 }), charge: 5, dir: [0, 1], targets: [target("a", [0, 1])] }),
    );
    const under = resolveMelee(
      input({ weapon: weapon({ damage: 20 }), charge: -5, dir: [0, 1], targets: [target("a", [0, 1])] }),
    );
    if (isOk(over)) expect(over.value[0]!.damage).toBe(20);
    if (isOk(under)) expect(under.value[0]!.damage).toBeCloseTo(20 * MIN_CHARGE_DAMAGE_FRACTION);
  });

  it("falls back to DEFAULT_REACH_M / DEFAULT_CONE_DEGREES when the weapon omits them", () => {
    const bareHands = weapon({ reach: undefined, coneDegrees: undefined });
    const justInReach = resolveMelee(
      input({ weapon: bareHands, dir: [0, 1], targets: [target("a", [0, DEFAULT_REACH_M - 0.1])] }),
    );
    const justOutOfReach = resolveMelee(
      input({ weapon: bareHands, dir: [0, 1], targets: [target("a", [0, DEFAULT_REACH_M + 0.5])] }),
    );
    expect(isOk(justInReach)).toBe(true);
    expect(isErr(justOutOfReach)).toBe(true);
  });

  it("a zero-length aim direction disables the facing check (reach-only gate)", () => {
    const r = resolveMelee(input({ dir: [0, 0], targets: [target("behind", [0, -2])] }));
    expect(isOk(r)).toBe(true);
  });
});

describe("chargeFraction", () => {
  it("is 0 right after a swing", () => {
    expect(chargeFraction(0, 1)).toBe(0);
  });

  it("ramps linearly up to 1 over 1/attackSpeed seconds", () => {
    expect(chargeFraction(0.5, 2)).toBeCloseTo(1); // 2 hits/s => 0.5s to recharge
    expect(chargeFraction(0.25, 2)).toBeCloseTo(0.5);
  });

  it("clamps at 1 once fully recharged, never exceeding it", () => {
    expect(chargeFraction(100, 1.5)).toBe(1);
  });

  it("treats a non-positive attackSpeed as already fully charged", () => {
    expect(chargeFraction(0, 0)).toBe(1);
    expect(chargeFraction(0, -1)).toBe(1);
  });
});

describe("chargeDamageScale", () => {
  it("floors at MIN_CHARGE_DAMAGE_FRACTION for zero charge", () => {
    expect(chargeDamageScale(0)).toBe(MIN_CHARGE_DAMAGE_FRACTION);
  });

  it("is 1 at full charge", () => {
    expect(chargeDamageScale(1)).toBe(1);
  });

  it("interpolates linearly between the two", () => {
    expect(chargeDamageScale(0.5)).toBeCloseTo(
      MIN_CHARGE_DAMAGE_FRACTION + (1 - MIN_CHARGE_DAMAGE_FRACTION) * 0.5,
    );
  });
});

describe("module constants", () => {
  it("keeps DEFAULT_CONE_DEGREES comfortably under SWEEP_CONE_DEGREES (bare hands never sweeps)", () => {
    expect(DEFAULT_CONE_DEGREES).toBeLessThan(SWEEP_CONE_DEGREES);
  });
});
