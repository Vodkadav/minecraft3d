import { describe, expect, it } from "vitest";
import {
  treasuresNear,
  TREASURE_CELL_M,
  type HiddenTreasure,
} from "../../game/domain/treasure/HiddenTreasure";
import {
  crossedTreasureCell,
  desiredTreasures,
  diffVisible,
  DISCOVER_RANGE_M,
  markerY,
  MARKER_HOVER_M,
  TIER_COLOR,
  withinDiscoveryRange,
} from "./TreasureStreaming";

function fakeTreasure(id: string, x = 0, z = 0): HiddenTreasure {
  return { id, position: [x, 0, z], tier: "common", reward: [{ itemId: "coin", count: 1 }] };
}

describe("crossedTreasureCell", () => {
  it("is false while the player stays inside the same cell", () => {
    expect(crossedTreasureCell(0, 0, 5, 5)).toBe(false);
    expect(crossedTreasureCell(0, 0, TREASURE_CELL_M - 0.01, TREASURE_CELL_M - 0.01)).toBe(false);
  });

  it("is true when the player crosses a cell boundary on either axis", () => {
    expect(crossedTreasureCell(0, 0, TREASURE_CELL_M + 1, 5)).toBe(true);
    expect(crossedTreasureCell(0, 0, 5, TREASURE_CELL_M + 1)).toBe(true);
    expect(crossedTreasureCell(0, 0, -1, 5)).toBe(true);
  });

  it("is true on the very first update (no previous cell)", () => {
    expect(crossedTreasureCell(null, null, 0, 0)).toBe(true);
  });

  it("handles negative world coordinates", () => {
    expect(crossedTreasureCell(-1, -1, -5, -5)).toBe(false);
    expect(crossedTreasureCell(-1, -1, -TREASURE_CELL_M - 5, -5)).toBe(true);
  });
});

describe("desiredTreasures", () => {
  it("returns every treasure in radius when nothing is discovered", () => {
    const all = treasuresNear(42, 100, 100, 4);
    expect(desiredTreasures(42, 100, 100, 4, [])).toEqual(all);
  });

  it("filters out already-discovered treasures", () => {
    const all = treasuresNear(42, 100, 100, 4);
    expect(all.length).toBeGreaterThan(1);
    const claimed = all[0].id;
    const desired = desiredTreasures(42, 100, 100, 4, [claimed]);
    expect(desired.map((t) => t.id)).not.toContain(claimed);
    expect(desired.length).toBe(all.length - 1);
  });
});

describe("diffVisible", () => {
  it("enters everything when nothing is visible yet", () => {
    const desired = [fakeTreasure("a"), fakeTreasure("b")];
    const diff = diffVisible(new Set(), desired);
    expect(diff.enter).toEqual(desired);
    expect(diff.leave).toEqual([]);
  });

  it("is empty at steady state", () => {
    const desired = [fakeTreasure("a"), fakeTreasure("b")];
    const diff = diffVisible(new Set(["a", "b"]), desired);
    expect(diff.enter).toEqual([]);
    expect(diff.leave).toEqual([]);
  });

  it("computes enters and leaves for a moved window", () => {
    const desired = [fakeTreasure("b"), fakeTreasure("c")];
    const diff = diffVisible(new Set(["a", "b"]), desired);
    expect(diff.enter.map((t) => t.id)).toEqual(["c"]);
    expect(diff.leave).toEqual(["a"]);
  });

  it("leaves a visible treasure that got discovered (no longer desired)", () => {
    const diff = diffVisible(new Set(["a"]), []);
    expect(diff.enter).toEqual([]);
    expect(diff.leave).toEqual(["a"]);
  });
});

describe("markerY", () => {
  it("hovers the marker above the resolved surface height", () => {
    expect(markerY(20)).toBe(20 + MARKER_HOVER_M);
    expect(markerY(-3.5)).toBe(-3.5 + MARKER_HOVER_M);
  });
});

describe("withinDiscoveryRange", () => {
  it("is true just inside the claim radius and false just outside", () => {
    expect(withinDiscoveryRange(0, 0, DISCOVER_RANGE_M - 0.01, 0)).toBe(true);
    expect(withinDiscoveryRange(0, 0, DISCOVER_RANGE_M + 0.01, 0)).toBe(false);
  });

  it("measures XZ euclidean distance, not per-axis", () => {
    const d = DISCOVER_RANGE_M * 0.8;
    expect(withinDiscoveryRange(0, 0, d, d)).toBe(false); // diagonal exceeds range
    expect(withinDiscoveryRange(10, -4, 10 + 1, -4 - 1)).toBe(true);
  });

  it("accepts a custom range", () => {
    expect(withinDiscoveryRange(0, 0, 5, 0, 6)).toBe(true);
    expect(withinDiscoveryRange(0, 0, 5, 0, 4)).toBe(false);
  });
});

describe("TIER_COLOR", () => {
  it("maps every tier to a distinct color", () => {
    const colors = [TIER_COLOR.common, TIER_COLOR.rare, TIER_COLOR.legendary];
    expect(new Set(colors).size).toBe(3);
    for (const c of colors) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
});
