import { describe, expect, it } from "vitest";
import { VoxelMaterial } from "./VoxelMaterial";
import {
  baseMaterialAtDepth,
  GEM_MIN_DEPTH_M,
  materialAt,
  ORE_MIN_DEPTH_M,
  oreGemMaterialSampler,
  veinMaterialAt,
} from "./OreGemSeeding";

describe("baseMaterialAtDepth bands", () => {
  it("maps each depth band to its material", () => {
    expect(baseMaterialAtDepth(0)).toBe(VoxelMaterial.GRASS);
    expect(baseMaterialAtDepth(0.3)).toBe(VoxelMaterial.GRASS);
    expect(baseMaterialAtDepth(0.35)).toBe(VoxelMaterial.TOPSOIL);
    expect(baseMaterialAtDepth(1)).toBe(VoxelMaterial.TOPSOIL);
    expect(baseMaterialAtDepth(1.5)).toBe(VoxelMaterial.STONE);
    expect(baseMaterialAtDepth(13)).toBe(VoxelMaterial.STONE);
    expect(baseMaterialAtDepth(14)).toBe(VoxelMaterial.DEEP_ROCK);
    expect(baseMaterialAtDepth(500)).toBe(VoxelMaterial.DEEP_ROCK);
  });
});

describe("veinMaterialAt", () => {
  it("never places a vein in the soil layers (above the ore floor)", () => {
    for (let d = 0; d < ORE_MIN_DEPTH_M; d += 0.25) {
      expect(veinMaterialAt(1, 0, -d, 0, d)).toBeNull();
    }
  });

  it("only yields ORE or null", () => {
    const seen = new Set<number | null>();
    for (let i = 0; i < 400; i++) {
      seen.add(veinMaterialAt(7, i * VEIN_STEP, -10, i, 10));
    }
    for (const v of seen) expect(v === null || v === VoxelMaterial.ORE).toBe(true);
  });

  it("keeps gems below their (deeper) floor", () => {
    // Between the ore and gem floors, a vein can only ever be ore.
    for (let d = ORE_MIN_DEPTH_M; d < GEM_MIN_DEPTH_M; d += 0.5) {
      for (let i = 0; i < 60; i++) {
        expect(veinMaterialAt(3, i * VEIN_STEP, -d, i, d)).not.toBe(VoxelMaterial.GEM);
      }
    }
  });

  it("is deterministic for the same seed and cell", () => {
    expect(veinMaterialAt(9, 4, -30, 6, 30)).toBe(veinMaterialAt(9, 4, -30, 6, 30));
  });
});

const VEIN_STEP = 2; // > VEIN_CELL_M so successive samples land in distinct cells

describe("materialAt", () => {
  it("returns the depth band where no vein rolls", () => {
    // Shallow soil is vein-free by construction.
    expect(materialAt(1, 0, 0, 0, 0.2)).toBe(VoxelMaterial.GRASS); // depth 0.2
    expect(materialAt(1, 0, 0, 0, 1)).toBe(VoxelMaterial.TOPSOIL); // depth 1
  });

  it("is deterministic and depth-driven via the surface height", () => {
    const a = materialAt(5, 12, -8, 3, 2);
    const b = materialAt(5, 12, -8, 3, 2);
    expect(a).toBe(b);
  });

  it("produces some ore in a deep volume, but as a minority of stone", () => {
    let ore = 0;
    let total = 0;
    for (let x = 0; x < 40; x++) {
      for (let z = 0; z < 40; z++) {
        for (let d = 5; d < 15; d++) {
          total++;
          if (materialAt(42, x, -d, z, 0) === VoxelMaterial.ORE) ore++;
        }
      }
    }
    expect(ore).toBeGreaterThan(0);
    expect(ore / total).toBeLessThan(0.15); // ore is scarce, not the bulk
  });

  it("makes gems rarer than ore over a deep volume", () => {
    let ore = 0;
    let gem = 0;
    for (let x = 0; x < 50; x++) {
      for (let z = 0; z < 50; z++) {
        for (let d = 25; d < 60; d++) {
          const m = materialAt(42, x, -d, z, 0);
          if (m === VoxelMaterial.ORE) ore++;
          if (m === VoxelMaterial.GEM) gem++;
        }
      }
    }
    expect(gem).toBeGreaterThan(0);
    expect(gem).toBeLessThan(ore);
  });

  it("lays out veins differently for different seeds", () => {
    let differences = 0;
    for (let d = 5; d < 60; d++) {
      if (materialAt(1, 3, -d, 9, 0) !== materialAt(2, 3, -d, 9, 0)) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });
});

describe("oreGemMaterialSampler", () => {
  it("measures depth from the surface source and matches materialAt", () => {
    const surface = { heightAt: (x: number, z: number) => x + z }; // arbitrary sloped surface
    const sampler = oreGemMaterialSampler(11, surface);
    expect(sampler.materialAt(4, -6, 2)).toBe(materialAt(11, 4, -6, 2, 4 + 2));
  });

  it("reads grass at the rim of a raised surface", () => {
    const surface = { heightAt: () => 100 };
    const sampler = oreGemMaterialSampler(11, surface);
    expect(sampler.materialAt(0, 99.8, 0)).toBe(VoxelMaterial.GRASS);
  });
});
