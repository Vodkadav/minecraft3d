import { describe, expect, it } from "vitest";
import { FULL_CHARGE_MS, MIN_CHARGE_MULTIPLIER, chargeMultiplier, isStrongCharge } from "./RangedCharge";

describe("chargeMultiplier", () => {
  it("is the minimum multiplier at zero charge (tap-fire)", () => {
    expect(chargeMultiplier(0)).toBeCloseTo(MIN_CHARGE_MULTIPLIER);
  });

  it("is 1.0 at exactly the full-charge threshold", () => {
    expect(chargeMultiplier(FULL_CHARGE_MS)).toBeCloseTo(1);
  });

  it("ramps linearly between the two", () => {
    expect(chargeMultiplier(FULL_CHARGE_MS / 2)).toBeCloseTo((MIN_CHARGE_MULTIPLIER + 1) / 2);
  });

  it("clamps a negative charge to the minimum", () => {
    expect(chargeMultiplier(-500)).toBeCloseTo(MIN_CHARGE_MULTIPLIER);
  });

  it("clamps an over-long hold to 1.0 (no infinite charge)", () => {
    expect(chargeMultiplier(FULL_CHARGE_MS * 10)).toBeCloseTo(1);
  });
});

describe("isStrongCharge", () => {
  it("is false below the threshold", () => {
    expect(isStrongCharge(FULL_CHARGE_MS - 1)).toBe(false);
  });

  it("is true at and above the threshold", () => {
    expect(isStrongCharge(FULL_CHARGE_MS)).toBe(true);
    expect(isStrongCharge(FULL_CHARGE_MS + 500)).toBe(true);
  });
});
