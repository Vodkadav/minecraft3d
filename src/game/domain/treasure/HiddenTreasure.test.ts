import { describe, expect, it } from "vitest";
import {
  treasureInCell,
  treasuresNear,
  TREASURE_CELL_M,
  worldToTreasureCell,
  type TreasureTier,
} from "./HiddenTreasure";

describe("treasureInCell", () => {
  it("is fully deterministic for a seed and cell", () => {
    const a = treasureInCell(42, 3, 7);
    const b = treasureInCell(42, 3, 7);
    expect(a).toEqual(b);
  });

  it("places a treasure inside its own cell bounds", () => {
    for (let cx = 0; cx < 200; cx++) {
      const t = treasureInCell(1, cx, 0);
      if (!t) continue;
      expect(t.position[0]).toBeGreaterThanOrEqual(cx * TREASURE_CELL_M);
      expect(t.position[0]).toBeLessThan((cx + 1) * TREASURE_CELL_M);
      expect(t.position[1]).toBe(0); // y is the [F] adapter's job
    }
  });

  it("gives every treasure a stable, cell-derived id", () => {
    for (let cx = 0; cx < 100; cx++) {
      const t = treasureInCell(9, cx, 5);
      if (t) expect(t.id).toBe(`treasure:9:${cx}:5`);
    }
  });

  it("only ever uses the defined tiers", () => {
    const tiers = new Set<TreasureTier>();
    for (let cx = 0; cx < 500; cx++) {
      const t = treasureInCell(3, cx, cx);
      if (t) tiers.add(t.tier);
    }
    for (const tier of tiers) expect(["common", "rare", "legendary"]).toContain(tier);
  });

  it("always yields at least one reward stack with a positive count", () => {
    for (let cx = 0; cx < 300; cx++) {
      const t = treasureInCell(11, cx, 4);
      if (!t) continue;
      expect(t.reward.length).toBeGreaterThan(0);
      for (const stack of t.reward) expect(stack.count).toBeGreaterThan(0);
    }
  });
});

describe("treasure density", () => {
  it("populates a sane minority of cells (not zero, not everything)", () => {
    let present = 0;
    const total = 60 * 60;
    for (let cx = 0; cx < 60; cx++) {
      for (let cz = 0; cz < 60; cz++) if (treasureInCell(42, cx, cz)) present++;
    }
    const fraction = present / total;
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.3);
  });

  it("lays treasures out differently for different seeds", () => {
    let differences = 0;
    for (let cx = 0; cx < 100; cx++) {
      const a = treasureInCell(1, cx, 0)?.id ?? null;
      const b = treasureInCell(2, cx, 0)?.id ?? null;
      if ((a === null) !== (b === null)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });

  it("makes legendaries rarer than commons across a large area", () => {
    let common = 0;
    let legendary = 0;
    for (let cx = 0; cx < 120; cx++) {
      for (let cz = 0; cz < 120; cz++) {
        const t = treasureInCell(7, cx, cz);
        if (t?.tier === "common") common++;
        if (t?.tier === "legendary") legendary++;
      }
    }
    expect(legendary).toBeGreaterThan(0);
    expect(legendary).toBeLessThan(common);
  });
});

describe("treasuresNear", () => {
  it("maps world coordinates to the containing cell", () => {
    expect(worldToTreasureCell(0)).toBe(0);
    expect(worldToTreasureCell(TREASURE_CELL_M - 1)).toBe(0);
    expect(worldToTreasureCell(TREASURE_CELL_M)).toBe(1);
    expect(worldToTreasureCell(-1)).toBe(-1);
  });

  it("returns the treasures in the cell window around a point", () => {
    const near = treasuresNear(42, 100, 100, 2);
    // every returned treasure's cell is within the 5x5 window of the center cell
    const ccx = worldToTreasureCell(100);
    const ccz = worldToTreasureCell(100);
    for (const t of near) {
      const tx = worldToTreasureCell(t.position[0]);
      const tz = worldToTreasureCell(t.position[2]);
      expect(Math.abs(tx - ccx)).toBeLessThanOrEqual(2);
      expect(Math.abs(tz - ccz)).toBeLessThanOrEqual(2);
    }
  });

  it("agrees with treasureInCell for the center cell", () => {
    const center = treasureInCell(42, worldToTreasureCell(500), worldToTreasureCell(500));
    const near = treasuresNear(42, 500, 500, 0);
    expect(near).toEqual(center ? [center] : []);
  });
});
