import { describe, expect, it } from "vitest";
import { lerpToward, smoothingFactor, stepToward, stepYaw } from "./CreatureSmoothing";

describe("lerpToward", () => {
  it("moves the fraction toward the target", () => {
    expect(lerpToward(0, 10, 0.5)).toBe(5);
  });

  it("stays put at k=0 and lands at k=1", () => {
    expect(lerpToward(1, 7, 0)).toBe(1);
    expect(lerpToward(1, 7, 1)).toBe(7);
  });

  it("stepToward is lerpToward applied per axis", () => {
    const [x, y, z] = stepToward([1, 2, 3], [7, 8, 9], 0.3);
    expect(x).toBe(lerpToward(1, 7, 0.3));
    expect(y).toBe(lerpToward(2, 8, 0.3));
    expect(z).toBe(lerpToward(3, 9, 0.3));
  });
});

describe("smoothingFactor", () => {
  it("is 0 for a zero timestep (no snap)", () => {
    expect(smoothingFactor(0)).toBe(0);
  });

  it("grows with dt and stays in [0, 1)", () => {
    const a = smoothingFactor(0.016);
    const b = smoothingFactor(0.1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(1);
  });

  it("halves the remaining distance per half-life", () => {
    expect(smoothingFactor(0.1, 0.1)).toBeCloseTo(0.5, 10);
  });
});

describe("stepToward", () => {
  it("moves each component the given fraction toward the target", () => {
    expect(stepToward([0, 0, 0], [10, -10, 4], 0.5)).toEqual([5, -5, 2]);
  });

  it("stays put at k=0 and lands at k=1", () => {
    expect(stepToward([1, 2, 3], [7, 8, 9], 0)).toEqual([1, 2, 3]);
    expect(stepToward([1, 2, 3], [7, 8, 9], 1)).toEqual([7, 8, 9]);
  });
});

describe("stepYaw", () => {
  it("interpolates plainly when the arc doesn't cross the wrap", () => {
    expect(stepYaw(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("takes the short way across the ±π wrap", () => {
    const next = stepYaw(3, -3, 0.5);
    expect(Math.abs(next)).toBeGreaterThan(3);
  });

  it("converges: repeated steps approach the target angle at a 10 Hz snapshot rate", () => {
    let yaw = -3;
    for (let i = 0; i < 200; i++) yaw = stepYaw(yaw, 3, smoothingFactor(0.1));
    const diff = Math.atan2(Math.sin(3 - yaw), Math.cos(3 - yaw));
    expect(Math.abs(diff)).toBeLessThan(1e-3);
  });
});
