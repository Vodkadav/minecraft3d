import { describe, expect, it } from "vitest";
import { clampFraction, isVitalCritical, stepVitalFill } from "./VitalsBar";

describe("clampFraction", () => {
  it("clamps into [0,1]", () => {
    expect(clampFraction(-0.5)).toBe(0);
    expect(clampFraction(1.5)).toBe(1);
    expect(clampFraction(0.4)).toBe(0.4);
  });
});

describe("stepVitalFill", () => {
  it("moves toward the target each step", () => {
    const next = stepVitalFill(0, 1, 0.1);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("converges to the target over repeated steps", () => {
    let v = 0;
    for (let i = 0; i < 180; i++) v = stepVitalFill(v, 1, 1 / 60);
    expect(v).toBeCloseTo(1, 3);
  });

  it("snaps exactly to the target once within epsilon", () => {
    const next = stepVitalFill(0.9999, 1, 1);
    expect(next).toBe(1);
  });

  it("clamps an out-of-range target before tweening", () => {
    const next = stepVitalFill(0, 2, 1);
    expect(next).toBeLessThanOrEqual(1);
  });

  it("is a no-op once already at the target", () => {
    expect(stepVitalFill(0.5, 0.5, 1 / 60)).toBe(0.5);
  });
});

describe("isVitalCritical", () => {
  it("false at full health", () => {
    expect(isVitalCritical(1)).toBe(false);
  });

  it("false at zero (dead, not pulsing)", () => {
    expect(isVitalCritical(0)).toBe(false);
  });

  it("true at the threshold boundary", () => {
    expect(isVitalCritical(0.25)).toBe(true);
  });

  it("false just above the threshold", () => {
    expect(isVitalCritical(0.26)).toBe(false);
  });

  it("true just below the threshold", () => {
    expect(isVitalCritical(0.1)).toBe(true);
  });
});
