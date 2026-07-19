/**
 * Pure placement rules + placeholder visual specs for the spawn adapter
 * (plan 5.4 [F]). Renderer-free so the walkable-ground rules are exactly
 * unit-tested; SpawnFieldView owns the three.js remainder. Real creature
 * models replace SPECIES_VISUAL in M6 — the registry key is the seam.
 */

import { CREATURE_REGISTRY } from "../game/domain/creatures/CreatureRegistry";

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

/** Closest of `items` within `rangeM` of (x, z), or null. */
export function nearestWithin<T extends { readonly x: number; readonly z: number }>(
  items: readonly T[],
  x: number,
  z: number,
  rangeM: number,
): T | null {
  let best: T | null = null;
  let bestSq = rangeM * rangeM;
  for (const it of items) {
    const dx = it.x - x;
    const dz = it.z - z;
    const d = dx * dx + dz * dz;
    if (d <= bestSq) {
      best = it;
      bestSq = d;
    }
  }
  return best;
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

const NODE_VISUAL: Readonly<Record<string, SpeciesVisual>> = {
  "stone-node": { shape: "box", color: 0x8a8d90, size: 0.9, lift: 0.35 },
  "berry-bush": { shape: "sphere", color: 0x7a2b3c, size: 0.7, lift: 0.45 },

  // resource nodes (7.4)
  "clay-deposit": { shape: "box", color: 0x9a5a3c, size: 0.8, lift: 0.3 },
  "sand-dune": { shape: "box", color: 0xdccb8a, size: 0.9, lift: 0.3 },
  "flint-node": { shape: "box", color: 0x555555, size: 0.6, lift: 0.25 },
  "coal-node": { shape: "box", color: 0x222222, size: 0.8, lift: 0.3 },
  "gold-vein": { shape: "box", color: 0xd4af37, size: 0.7, lift: 0.3 },
  "copper-vein": { shape: "box", color: 0xb87333, size: 0.7, lift: 0.3 },
  "reed-patch": { shape: "cone", color: 0x6a9c4a, size: 0.6, lift: 0.3 },
  "wheat-patch": { shape: "sphere", color: 0xe0c14a, size: 0.5, lift: 0.25 },
  "carrot-patch": { shape: "sphere", color: 0xe07a2a, size: 0.45, lift: 0.22 },
  "potato-patch": { shape: "sphere", color: 0xc9a86a, size: 0.5, lift: 0.25 },
  "fishing-spot": { shape: "sphere", color: 0x3a7ca5, size: 0.6, lift: 0.1 },
};

/** Fallback primitives for creatures (used until/unless a rigged model is
 *  loaded for the species — CreatureModelLibrary.has() gates it), derived
 *  from CreatureRegistry (E0.2) instead of hand-maintained here. */
const CREATURE_VISUAL: Readonly<Record<string, SpeciesVisual>> = Object.fromEntries(
  CREATURE_REGISTRY.all().map((c) => [c.id, c.visual]),
);

export const SPECIES_VISUAL: Readonly<Record<string, SpeciesVisual>> = {
  ...NODE_VISUAL,
  ...CREATURE_VISUAL,
};
