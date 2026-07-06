/**
 * Deterministic depth-seeded ore/gem material function (plan 8.4, [O]).
 *
 * Replaces the `depthBandSampler` placeholder behind the same `MaterialSampler`
 * port. Pure and renderer-free: given a world seed and a surface-height source
 * it decides the material id of any solid voxel — depth bands (grass skin →
 * topsoil → stone → deep rock) overlaid with hash-seeded ore veins and rare,
 * deep gem pockets. Same seed ⇒ bit-identical layout on every machine and peer,
 * which is what lets unmodified chunks regenerate from seed instead of persisting
 * (research §3/§7). The GPU/mesh painting of these ids is Fable's [F] concern;
 * this module only names them.
 */

import { hashUnitFloat } from "../rng/hash";
import { VoxelMaterial } from "./VoxelMaterial";
import type { MaterialSampler } from "./VoxelVolume";

/** The surface the depth is measured from (engine adapter: heightfield). */
export interface SurfaceHeight {
  heightAt(wx: number, wz: number): number;
}

/** Depth bands, in meters below the surface. Tuned constants, not magic. */
export const GRASS_SKIN_DEPTH_M = 0.35;
export const TOPSOIL_DEPTH_M = 1.5;
export const DEEP_ROCK_DEPTH_M = 14;

/** Veins never intrude the soil layers — they start well inside the stone. */
export const ORE_MIN_DEPTH_M = 3;
export const GEM_MIN_DEPTH_M = 22;

/** Ore/gem abundance ramps from its min depth to `*_FULL_DEPTH_M`, then caps. */
const ORE_FULL_DEPTH_M = 40;
const GEM_FULL_DEPTH_M = 80;
const ORE_MAX_CHANCE = 0.05;
const GEM_MAX_CHANCE = 0.01;

/** Cube edge (meters) of a single vein cell; voxels in a cell share a vein. */
const VEIN_CELL_M = 1.5;

/** Salts keep the ore and gem draws independent for the same cell. */
const ORE_SALT = 0x0be;
const GEM_SALT = 0x9e3;

/** Base material by depth below the surface, before any vein overlay. */
export function baseMaterialAtDepth(depth: number): number {
  if (depth < GRASS_SKIN_DEPTH_M) return VoxelMaterial.GRASS;
  if (depth < TOPSOIL_DEPTH_M) return VoxelMaterial.TOPSOIL;
  if (depth < DEEP_ROCK_DEPTH_M) return VoxelMaterial.STONE;
  return VoxelMaterial.DEEP_ROCK;
}

function ramp(depth: number, start: number, full: number, cap: number): number {
  if (depth < start) return 0;
  return Math.min((depth - start) / (full - start), 1) * cap;
}

/**
 * ORE, GEM, or null (no vein) at a world position with a known depth. Gems are
 * rarer and deeper; where both roll, the gem wins (it is the scarcer find).
 */
export function veinMaterialAt(
  seed: number,
  wx: number,
  wy: number,
  wz: number,
  depth: number,
): number | null {
  if (depth < ORE_MIN_DEPTH_M) return null;
  const cx = Math.floor(wx / VEIN_CELL_M);
  const cy = Math.floor(wy / VEIN_CELL_M);
  const cz = Math.floor(wz / VEIN_CELL_M);

  if (depth >= GEM_MIN_DEPTH_M) {
    const gem = hashUnitFloat(seed, cx, cy, cz, GEM_SALT);
    if (gem < ramp(depth, GEM_MIN_DEPTH_M, GEM_FULL_DEPTH_M, GEM_MAX_CHANCE)) {
      return VoxelMaterial.GEM;
    }
  }
  const ore = hashUnitFloat(seed, cx, cy, cz, ORE_SALT);
  if (ore < ramp(depth, ORE_MIN_DEPTH_M, ORE_FULL_DEPTH_M, ORE_MAX_CHANCE)) {
    return VoxelMaterial.ORE;
  }
  return null;
}

/** Material id of the solid voxel at a world position under `surfaceY`. */
export function materialAt(
  seed: number,
  wx: number,
  wy: number,
  wz: number,
  surfaceY: number,
): number {
  const depth = surfaceY - wy;
  const vein = veinMaterialAt(seed, wx, wy, wz, depth);
  return vein ?? baseMaterialAtDepth(depth);
}

/** Build the `MaterialSampler` port over a surface-height source. */
export function oreGemMaterialSampler(
  seed: number,
  surface: SurfaceHeight,
): MaterialSampler {
  return {
    materialAt: (wx, wy, wz) => materialAt(seed, wx, wy, wz, surface.heightAt(wx, wz)),
  };
}
