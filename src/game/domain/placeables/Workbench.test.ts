import { describe, expect, it } from "vitest";
import { isNearWorkbench, resolveUnlockedTier, withinRadius, WORKBENCH_UNLOCK_TIER } from "./Workbench";

describe("withinRadius / isNearWorkbench", () => {
  it("true when a point is within radius", () => {
    expect(withinRadius({ x: 0, y: 0, z: 0 }, [{ x: 3, y: 0, z: 0 }], 4)).toBe(true);
  });

  it("false when every point is beyond radius", () => {
    expect(withinRadius({ x: 0, y: 0, z: 0 }, [{ x: 10, y: 0, z: 0 }], 4)).toBe(false);
  });

  it("false with no points", () => {
    expect(isNearWorkbench({ x: 0, y: 0, z: 0 }, [])).toBe(false);
  });

  it("considers 3D distance, not just XZ", () => {
    expect(withinRadius({ x: 0, y: 0, z: 0 }, [{ x: 0, y: 5, z: 0 }], 4)).toBe(false);
  });
});

describe("resolveUnlockedTier", () => {
  it("keeps the base tier when far from a workbench", () => {
    expect(resolveUnlockedTier(0, false)).toBe(0);
    expect(resolveUnlockedTier(3, false)).toBe(3);
  });

  it("bumps up to the workbench tier when near", () => {
    expect(resolveUnlockedTier(0, true)).toBe(WORKBENCH_UNLOCK_TIER);
  });

  it("never lowers a base tier that already exceeds the workbench tier", () => {
    expect(resolveUnlockedTier(5, true)).toBe(5);
  });
});
