/**
 * Deterministic seeded spawning (plan 5.2 [O]). Pure and renderer-free:
 * resource nodes and creatures are seeded over a coarse world-cell grid with
 * `hash(seed, epoch, cell, salt)` — the research §4 pattern, verified against
 * Minecraft's spawn model (docs/research/BUILD_ON_LAAS_RESEARCH.md §4) — so
 * every peer computes identical spawns from the seed with nothing to sync.
 *
 * Density is ONE multiplier (the M4 `animalDensity` slider, 0..1) on the
 * per-cell budget: each species rolls its slots independently, and a slot
 * materializes only while its roll is below `weight × density`.
 *
 * `y` is 0 here — the domain has no surface; the [F] adapter resolves it
 * (same contract as HiddenTreasure).
 */

import { hashUnitFloat } from "../rng/hash";

export type SpawnKind = "node" | "creature";

export interface SpawnSpecies {
  readonly id: string;
  readonly kind: SpawnKind;
  /** Max slots this species rolls per cell (before the density multiplier). */
  readonly maxPerCell: number;
  /** 0..1 — chance each slot materializes at full density. */
  readonly weight: number;
}

/** MVP registry — placeholder visuals in the adapter; models arrive in M6. */
export const SPAWN_SPECIES: readonly SpawnSpecies[] = [
  { id: "stone-node", kind: "node", maxPerCell: 2, weight: 0.5 },
  { id: "berry-bush", kind: "node", maxPerCell: 2, weight: 0.4 },
  { id: "deer", kind: "creature", maxPerCell: 1, weight: 0.35 },
  { id: "wolf", kind: "creature", maxPerCell: 1, weight: 0.2 },
];

/**
 * What harvesting a node yields. Deliberately NOT the M3 gathering domain:
 * that models in-place respawning nodes; spawn-field nodes are streamed
 * entities that despawn forever once harvested (per epoch).
 */
export const NODE_YIELD: Readonly<Record<string, readonly { itemId: string; count: number }[]>> = {
  "stone-node": [{ itemId: "stone", count: 2 }],
  "berry-bush": [{ itemId: "berries", count: 2 }],
};

export interface SpawnEntity {
  /** Stable id (seed+epoch+cell+slot) — harvest/kill references this. */
  readonly id: string;
  readonly species: string;
  readonly kind: SpawnKind;
  /** World position; y is 0 until the [F] adapter resolves the surface. */
  readonly position: readonly [number, number, number];
}

/** Edge (meters) of a spawn cell. */
export const SPAWN_CELL_M = 32;

// 0x100-spaced so `salt + k` (k < 32) never collides across the three uses
const EXISTS_SALT = 0x5100;
const POS_X_SALT = 0x5200;
const POS_Z_SALT = 0x5300;

export function worldToSpawnCell(coord: number): number {
  return Math.floor(coord / SPAWN_CELL_M);
}

/** All spawns of cell (cx, cz) for this seed+epoch at the given density. */
export function spawnsInCell(
  seed: number,
  epoch: number,
  cx: number,
  cz: number,
  density: number,
): SpawnEntity[] {
  const out: SpawnEntity[] = [];
  for (let si = 0; si < SPAWN_SPECIES.length; si++) {
    const sp = SPAWN_SPECIES[si] as SpawnSpecies;
    for (let slot = 0; slot < sp.maxPerCell; slot++) {
      const k = si * 8 + slot;
      if (hashUnitFloat(seed, epoch, cx, cz, EXISTS_SALT + k) >= sp.weight * density) continue;
      const x = (cx + hashUnitFloat(seed, epoch, cx, cz, POS_X_SALT + k)) * SPAWN_CELL_M;
      const z = (cz + hashUnitFloat(seed, epoch, cx, cz, POS_Z_SALT + k)) * SPAWN_CELL_M;
      out.push({
        id: `spawn:${seed}:${epoch}:${cx}:${cz}:${k}`,
        species: sp.id,
        kind: sp.kind,
        position: [x, 0, z],
      });
    }
  }
  return out;
}

/** Every spawn within `radiusCells` cells of world position (x, z). */
export function spawnsNear(
  seed: number,
  epoch: number,
  x: number,
  z: number,
  radiusCells: number,
  density: number,
): SpawnEntity[] {
  const ccx = worldToSpawnCell(x);
  const ccz = worldToSpawnCell(z);
  const found: SpawnEntity[] = [];
  for (let dz = -radiusCells; dz <= radiusCells; dz++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      found.push(...spawnsInCell(seed, epoch, ccx + dx, ccz + dz, density));
    }
  }
  return found;
}
