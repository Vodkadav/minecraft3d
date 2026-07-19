/**
 * Biome-distinct resource tables (Workstream 7.4). `domain/game` has no
 * biome concept of its own — the engine's real biome classification
 * (`Biome` enum, moisture/climate simulation) lives in `src/world/WorldConst.ts`
 * and friends, which `game-domain-is-pure` (dependency-cruiser) forbids this
 * layer from importing, and it isn't threaded into any game-layer port either
 * (`SpawnGround` only exposes `heightAt`/`waterAt`). Rather than leave biome
 * distinctness unimplemented, this is an explicit, documented PROXY:
 * `classifyBiome` buckets by height alone, using round-number bands loosely
 * inspired by the engine's real elevation constants (treeline ~950 m,
 * snowline ~1050 m) without importing them. Recorded gap: no moisture/climate
 * signal reaches game code, so a wetland at low elevation and a dry lowland
 * both classify as "lowland" — a real biome-aware classifier needs a new
 * engine-side port (out of scope for this slice).
 */

export type BiomeId = "lowland" | "highland" | "alpine";

const LOWLAND_MAX_M = 250;
const HIGHLAND_MAX_M = 900;

/** Height-only proxy classification — see module doc for the gap this records. */
export function classifyBiome(heightM: number): BiomeId {
  if (heightM < LOWLAND_MAX_M) return "lowland";
  if (heightM < HIGHLAND_MAX_M) return "highland";
  return "alpine";
}

export interface BiomeResourceTable {
  /** Item ids this biome favors for hand-gatherable materials. */
  readonly gatherables: readonly string[];
  /** SPAWN_SPECIES node ids (domain/spawn/SpawnField) favored here. */
  readonly nodes: readonly string[];
  /** SPAWN_SPECIES creature ids favored here. */
  readonly creatures: readonly string[];
}

export const BIOME_RESOURCES: Readonly<Record<BiomeId, BiomeResourceTable>> = {
  lowland: {
    gatherables: ["wood", "fiber", "clay", "sand", "berries", "fish"],
    nodes: ["berry-bush", "reed-patch", "clay-deposit", "sand-dune", "fishing-spot", "wheat-patch", "carrot-patch"],
    creatures: ["deer", "rabbit", "fox"],
  },
  highland: {
    gatherables: ["stone", "flint", "coal", "ore"],
    nodes: ["stone-node", "flint-node", "coal-node", "potato-patch"],
    creatures: ["wolf", "boar", "elk"],
  },
  alpine: {
    gatherables: ["gold-ore", "copper-ore"],
    nodes: ["gold-vein", "copper-vein"],
    creatures: ["elk", "wolf"],
  },
};

export function resourcesFor(biome: BiomeId): BiomeResourceTable {
  return BIOME_RESOURCES[biome];
}

/** Convenience: the resource table for a raw height, via the proxy classifier. */
export function resourcesAtHeight(heightM: number): BiomeResourceTable {
  return resourcesFor(classifyBiome(heightM));
}
