import { describe, expect, it } from "vitest";
import type { PlayerState } from "../world/WorldSaveData";
import { validateDig, validatePose } from "./IntentRules";

function pose(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], yaw: 0, pitch: 0 };
}

describe("validatePose", () => {
  it("accepts the first pose (no previous)", () => {
    expect(validatePose(null, pose(100, 20, -50), 0)).toBe(true);
  });

  it("rejects a first pose with non-finite numbers", () => {
    expect(validatePose(null, pose(NaN, 0, 0), 0)).toBe(false);
    expect(validatePose(null, pose(0, Infinity, 0), 0)).toBe(false);
    expect(validatePose(null, { position: [0, 0, 0], yaw: NaN, pitch: 0 }, 0)).toBe(false);
  });

  it("accepts normal walking speed", () => {
    // 0.5 m in 100 ms = 5 m/s
    expect(validatePose(pose(0, 0, 0), pose(0.5, 0, 0), 100)).toBe(true);
  });

  it("accepts up to the ~20 m/s horizontal cap", () => {
    expect(validatePose(pose(0, 0, 0), pose(1.9, 0, 0), 100)).toBe(true);
  });

  it("rejects a horizontal teleport", () => {
    // 100 m in 100 ms = 1000 m/s
    expect(validatePose(pose(0, 0, 0), pose(100, 0, 0), 100)).toBe(false);
  });

  it("is generous vertically (falling) but still rejects vertical teleports", () => {
    expect(validatePose(pose(0, 100, 0), pose(0, 95, 0), 100)).toBe(true); // 50 m/s fall
    expect(validatePose(pose(0, 0, 0), pose(0, 500, 0), 100)).toBe(false);
  });

  it("accepts standing still even with zero elapsed time", () => {
    expect(validatePose(pose(1, 2, 3), pose(1, 2, 3), 0)).toBe(true);
  });

  it("rejects movement with zero or negative elapsed time", () => {
    expect(validatePose(pose(0, 0, 0), pose(1, 0, 0), 0)).toBe(false);
    expect(validatePose(pose(0, 0, 0), pose(1, 0, 0), -5)).toBe(false);
  });
});

describe("validateDig", () => {
  it("accepts a sane dig", () => {
    expect(validateDig(10, -3, 42, 1.5)).toBe(true);
  });

  it("accepts radius up to 4", () => {
    expect(validateDig(0, 0, 0, 4)).toBe(true);
  });

  it("rejects radius of 0, negative, or over 4", () => {
    expect(validateDig(0, 0, 0, 0)).toBe(false);
    expect(validateDig(0, 0, 0, -1)).toBe(false);
    expect(validateDig(0, 0, 0, 4.01)).toBe(false);
  });

  it("rejects non-finite coordinates or radius", () => {
    expect(validateDig(NaN, 0, 0, 1)).toBe(false);
    expect(validateDig(0, Infinity, 0, 1)).toBe(false);
    expect(validateDig(0, 0, 0, NaN)).toBe(false);
  });
});
