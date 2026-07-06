import { describe, expect, it } from "vitest";
import { colorForPeer, smoothingFactor, stepToward, stepYaw } from "./RemotePlayerMath";

describe("colorForPeer", () => {
  it("is deterministic per peerId", () => {
    expect(colorForPeer("alice")).toBe(colorForPeer("alice"));
  });

  it("gives different peers different colors", () => {
    const colors = new Set(["alice", "bob", "carol", "host"].map(colorForPeer));
    expect(colors.size).toBe(4);
  });

  it("yields a valid 24-bit RGB int", () => {
    const c = colorForPeer("alice");
    expect(Number.isInteger(c)).toBe(true);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(0xffffff);
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
    const next = stepYaw(3, -3, 0.5); // short arc is +0.28..., through π
    expect(Math.abs(next)).toBeGreaterThan(3); // moved toward π, not through 0
  });

  it("converges: repeated steps approach the target angle", () => {
    let yaw = -3;
    for (let i = 0; i < 200; i++) yaw = stepYaw(yaw, 3, 0.2);
    // -3 and 3 are ~0.28 rad apart across the wrap
    const diff = Math.atan2(Math.sin(3 - yaw), Math.cos(3 - yaw));
    expect(Math.abs(diff)).toBeLessThan(1e-3);
  });
});
