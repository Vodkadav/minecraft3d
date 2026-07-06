/**
 * Pure placement rules + placeholder visual specs for the spawn adapter
 * (plan 5.4 [F]). Renderer-free so the walkable-ground rules are exactly
 * unit-tested; SpawnFieldView owns the three.js remainder. Real creature
 * models replace SPECIES_VISUAL in M6 — the registry key is the seam.
 */

export interface SpawnGround {
  heightAt(x: number, z: number): number;
  /** Water surface y at (x,z); omit in scenes without water. */
  waterAt?(x: number, z: number): number;
}

/** Max |dh/dx| a spawn tolerates — beyond this it's a cliff face. */
export const MAX_SLOPE = 0.9;
/** Spawn must clear the water surface by this much. */
const DRY_MARGIN_M = 0.3;
/** Finite-difference step for the slope probe. */
const SLOPE_STEP_M = 2;

export function validGround(ground: SpawnGround, x: number, z: number): boolean {
  const h = ground.heightAt(x, z);
  const water = ground.waterAt?.(x, z) ?? -Infinity;
  if (h <= water + DRY_MARGIN_M) return false;
  const sx = (ground.heightAt(x + SLOPE_STEP_M, z) - ground.heightAt(x - SLOPE_STEP_M, z)) /
    (2 * SLOPE_STEP_M);
  const sz = (ground.heightAt(x, z + SLOPE_STEP_M) - ground.heightAt(x, z - SLOPE_STEP_M)) /
    (2 * SLOPE_STEP_M);
  return Math.hypot(sx, sz) <= MAX_SLOPE;
}

export interface SpeciesVisual {
  /** Placeholder primitive until M6 models land. */
  readonly shape: "box" | "sphere" | "cone";
  readonly color: number;
  /** Uniform size (m) of the primitive. */
  readonly size: number;
  /** Lift above the surface so the primitive sits on, not in, the ground. */
  readonly lift: number;
}

export const SPECIES_VISUAL: Readonly<Record<string, SpeciesVisual>> = {
  "stone-node": { shape: "box", color: 0x8a8d90, size: 0.9, lift: 0.35 },
  "berry-bush": { shape: "sphere", color: 0x7a2b3c, size: 0.7, lift: 0.45 },
  deer: { shape: "cone", color: 0xb98a5a, size: 1.4, lift: 0.7 },
  boar: { shape: "cone", color: 0x5d4633, size: 1.0, lift: 0.5 },
};
