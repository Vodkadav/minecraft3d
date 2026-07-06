/**
 * Voxel material ids -> albedo palette, plus a PLACEHOLDER depth-band sampler.
 *
 * [O — Opus work, plan 8.4]: the real deterministic ore/gem seeding function
 * (hash(seed, cell, depth) veins, tuned bands, TDD'd) replaces
 * `depthBandSampler` behind the same domain `MaterialSampler` port. This
 * placeholder only proves the paint path: dirt near the surface, stone below,
 * deep rock further down.
 */

import type { MaterialSampler } from '../game/domain/voxel/VoxelVolume';
import type { VoxelSurface } from './VoxelTerrain';

export const VOXEL_MATERIAL_RGB: readonly [number, number, number][] = [
  [0.4, 0.375, 0.34], // 0 stone
  [0.23, 0.175, 0.115], // 1 topsoil
  [0.28, 0.27, 0.265], // 2 deep rock
  [0.75, 0.6, 0.2], // 3 ore vein (unused until the Opus seeding lands)
  [0.35, 0.7, 0.75], // 4 gem (unused until the Opus seeding lands)
  [0.07, 0.12, 0.04], // 5 surface grass — blends the re-meshed dig rim
];

/** Placeholder [O]: material by depth below the surface. */
export function depthBandSampler(surface: VoxelSurface): MaterialSampler {
  return {
    materialAt(wx: number, wy: number, wz: number): number {
      const depth = surface.heightAt(wx, wz) - wy;
      if (depth < 0.35) return 5; // grass skin at the rim
      if (depth < 1.5) return 1; // topsoil crust
      if (depth < 14) return 0; // stone
      return 2; // deep rock
    },
  };
}
