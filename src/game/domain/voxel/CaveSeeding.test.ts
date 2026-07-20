import { describe, expect, it } from "vitest";
import { SUBTERRANEAN_FLOOR_Y_M } from "./VoxelGrid";
import {
  CAVE_SAFE_DEPTH_M,
  caveOpennessAt,
  chamberStrength,
  isCaveCarved,
  tunnelStrength,
  withCaveCarving,
} from "./CaveSeeding";

/** Elevated flat surface so depth sampling never crosses the world's y=0
 *  subterranean floor — that gate has its own dedicated test below. */
const SURFACE_Y = 120;

describe("isCaveCarved — safe-depth gate", () => {
  it("never carves above the safe depth below the surface, for any seed/position", () => {
    for (let seed = 0; seed < 5; seed++) {
      for (let x = 0; x < 30; x += 3) {
        for (let z = 0; z < 30; z += 3) {
          for (let d = 0; d < CAVE_SAFE_DEPTH_M; d += 1) {
            const wy = SURFACE_Y - d;
            expect(isCaveCarved(seed, x, wy, z, SURFACE_Y)).toBe(false);
          }
        }
      }
    }
  });

  it("never carves at or below the world's subterranean floor, however deep the surface", () => {
    const highSurface = 200;
    for (let seed = 0; seed < 4; seed++) {
      for (let x = 0; x < 20; x += 4) {
        for (let z = 0; z < 20; z += 4) {
          expect(isCaveCarved(seed, x, SUBTERRANEAN_FLOOR_Y_M, z, highSurface)).toBe(false);
          expect(isCaveCarved(seed, x, SUBTERRANEAN_FLOOR_Y_M - 5, z, highSurface)).toBe(false);
        }
      }
    }
  });
});

describe("isCaveCarved — determinism", () => {
  it("is deterministic for the same seed and position", () => {
    const a = isCaveCarved(7, 12, SURFACE_Y - 40, -8, SURFACE_Y);
    const b = isCaveCarved(7, 12, SURFACE_Y - 40, -8, SURFACE_Y);
    expect(a).toBe(b);
    expect(caveOpennessAt(7, 12, SURFACE_Y - 40, -8, SURFACE_Y)).toBe(
      caveOpennessAt(7, 12, SURFACE_Y - 40, -8, SURFACE_Y),
    );
  });

  it("lays out caves differently for different seeds", () => {
    let differences = 0;
    for (let x = 0; x < 80; x++) {
      if (
        isCaveCarved(1, x, SURFACE_Y - 50, 3, SURFACE_Y) !==
        isCaveCarved(2, x, SURFACE_Y - 50, 3, SURFACE_Y)
      ) {
        differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });
});

describe("isCaveCarved — carves a real volume, denser with depth", () => {
  function carvedFraction(seed: number, minDepth: number, maxDepth: number): number {
    let carved = 0;
    let total = 0;
    for (let x = 0; x < 60; x += 2) {
      for (let z = 0; z < 60; z += 2) {
        for (let d = minDepth; d < maxDepth; d += 2) {
          total++;
          if (isCaveCarved(seed, x, SURFACE_Y - d, z, SURFACE_Y)) carved++;
        }
      }
    }
    return carved / total;
  }

  it("carves some open space in a deep volume", () => {
    const fraction = carvedFraction(11, 20, 100);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThan(0.6); // still mostly solid rock, not swiss cheese
  });

  it("is denser deep underground than just past the safe floor", () => {
    const shallow = carvedFraction(11, CAVE_SAFE_DEPTH_M, CAVE_SAFE_DEPTH_M + 15);
    const deep = carvedFraction(11, 70, 100);
    expect(deep).toBeGreaterThan(shallow);
  });
});

describe("isCaveCarved — network connectivity heuristic", () => {
  it("most carved cells have at least one carved orthogonal neighbor (corridors, not lone dots)", () => {
    const seed = 5;
    const y = SURFACE_Y - 60;
    let carvedCount = 0;
    let connected = 0;
    for (let x = 0; x < 80; x++) {
      for (let z = 0; z < 80; z++) {
        if (!isCaveCarved(seed, x, y, z, SURFACE_Y)) continue;
        carvedCount++;
        const neighbors: Array<[number, number, number]> = [
          [x + 1, y, z],
          [x - 1, y, z],
          [x, y, z + 1],
          [x, y, z - 1],
          [x, y + 1, z],
          [x, y - 1, z],
        ];
        if (neighbors.some(([nx, ny, nz]) => isCaveCarved(seed, nx, ny, nz, SURFACE_Y))) {
          connected++;
        }
      }
    }
    expect(carvedCount).toBeGreaterThan(10);
    expect(connected / carvedCount).toBeGreaterThan(0.6);
  });
});

describe("tunnelStrength / chamberStrength", () => {
  it("stay within [0, 1]", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 1.7;
      const y = -i * 0.9;
      const z = i * 2.3;
      const t = tunnelStrength(3, x, y, z);
      const c = chamberStrength(3, x, y, z);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe("caveOpennessAt — sign matches the predicate", () => {
  it("is positive exactly where isCaveCarved is true", () => {
    for (let x = 0; x < 60; x += 1) {
      const carved = isCaveCarved(9, x, SURFACE_Y - 40, 4, SURFACE_Y);
      const openness = caveOpennessAt(9, x, SURFACE_Y - 40, 4, SURFACE_Y);
      expect(carved).toBe(openness > 0);
    }
  });
});

describe("withCaveCarving", () => {
  const surface = { heightAt: () => SURFACE_Y };

  it("unions cave openness into a terrain SDF (max, air wins)", () => {
    const terrainSdfAt = () => -5; // deep solid rock everywhere
    const combined = withCaveCarving(9, surface, terrainSdfAt);
    let sawCarve = false;
    for (let x = 0; x < 80 && !sawCarve; x++) {
      if (isCaveCarved(9, x, SURFACE_Y - 40, 4, SURFACE_Y)) {
        expect(combined(x, SURFACE_Y - 40, 4)).toBeGreaterThan(0);
        sawCarve = true;
      }
    }
    expect(sawCarve).toBe(true);
  });

  it("never overrides solid terrain above the safe depth, even where the raw field would carve", () => {
    const terrainSdfAt = () => -1; // solid everywhere the caller asks
    const combined = withCaveCarving(9, surface, terrainSdfAt);
    for (let d = 0; d < CAVE_SAFE_DEPTH_M; d++) {
      expect(combined(0, SURFACE_Y - d, 0)).toBeLessThan(0);
    }
  });

  it("leaves shallow terrain untouched where nothing is carved", () => {
    const terrainSdfAt = (_x: number, y: number, _z: number) => y - SURFACE_Y;
    const combined = withCaveCarving(9, surface, terrainSdfAt);
    expect(combined(100, SURFACE_Y + 5, 100)).toBe(terrainSdfAt(100, SURFACE_Y + 5, 100));
  });
});
