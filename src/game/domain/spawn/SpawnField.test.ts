/**
 * M5.2 deterministic seeded spawning: same seed ⇒ identical spawns on every
 * peer with nothing to sync; density is ONE multiplier on the per-cell
 * budget; positions land inside their cell.
 */
import { describe, expect, it } from "vitest";
import {
  SPAWN_CELL_M,
  SPAWN_SPECIES,
  spawnsInCell,
  spawnsNear,
  worldToSpawnCell,
} from "./SpawnField";

describe("spawnsInCell determinism", () => {
  it("returns identical entities for the same (seed, epoch, cell, density)", () => {
    const a = spawnsInCell(42, 0, 3, -7, 1);
    const b = spawnsInCell(42, 0, 3, -7, 1);
    expect(a).toEqual(b);
  });

  it("differs across seeds and epochs", () => {
    const bySeed = [1, 2, 3, 4, 5].map((s) => spawnsInCell(s, 0, 0, 0, 1).length);
    const byEpoch = [0, 1, 2, 3, 4].map((e) => spawnsInCell(1, e, 0, 0, 1).length);
    expect(new Set(bySeed).size + new Set(byEpoch).size).toBeGreaterThan(2);
  });

  it("gives every entity a stable unique id and a species from the registry", () => {
    const all = spawnsNear(42, 0, 0, 0, 4, 1);
    const ids = new Set(all.map((s) => s.id));
    expect(ids.size).toBe(all.length);
    const speciesIds = new Set(SPAWN_SPECIES.map((sp) => sp.id));
    for (const s of all) expect(speciesIds.has(s.species)).toBe(true);
  });

  it("places each entity inside its own cell", () => {
    for (const s of spawnsInCell(42, 0, 3, -7, 1)) {
      expect(worldToSpawnCell(s.position[0])).toBe(3);
      expect(worldToSpawnCell(s.position[2])).toBe(-7);
    }
  });
});

describe("density multiplier", () => {
  function countOver(cells: number, density: number): number {
    let n = 0;
    for (let c = 0; c < cells; c++) n += spawnsInCell(42, 0, c, 0, density).length;
    return n;
  }

  it("zero density spawns nothing", () => {
    expect(countOver(50, 0)).toBe(0);
  });

  it("full density spawns strictly more than half density", () => {
    const half = countOver(200, 0.5);
    const full = countOver(200, 1);
    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(0);
  });
});

describe("cell math", () => {
  it("worldToSpawnCell floors by the cell edge", () => {
    expect(worldToSpawnCell(0)).toBe(0);
    expect(worldToSpawnCell(SPAWN_CELL_M - 0.001)).toBe(0);
    expect(worldToSpawnCell(SPAWN_CELL_M)).toBe(1);
    expect(worldToSpawnCell(-0.001)).toBe(-1);
  });
});
