/**
 * Deterministic hidden-treasure placement (plan 8.7, [O]). Pure and
 * renderer-free: treasures are seeded over a coarse world-cell grid with
 * `hash(seed, cell, salt)` (the research §4 pattern, same primitive as the
 * ore/gem veins), so every peer computes the same treasures from the seed with
 * nothing to sync. Each treasure's position, tier, and reward are all derived
 * deterministically from the cell hash.
 *
 * The `y` of a treasure position is left at 0 here — the domain has no surface
 * height. The [F] engine adapter resolves y against the heightfield when it
 * spawns the discoverable marker (see the handoff notes).
 */

import { hashUnitFloat } from "../rng/hash";
import type { ItemStack } from "../inventory/Inventory";

export type TreasureTier = "common" | "rare" | "legendary";

export interface HiddenTreasure {
  /** Stable id (seed+cell) — discovery references this without storing a position. */
  readonly id: string;
  /** World position; y is 0 until the [F] adapter resolves it to the surface. */
  readonly position: readonly [number, number, number];
  readonly tier: TreasureTier;
  readonly reward: readonly ItemStack[];
}

/** Edge (meters) of a treasure cell — at most one treasure per cell. */
export const TREASURE_CELL_M = 32;
/** Fraction of cells that hold a treasure. */
export const TREASURE_DENSITY = 0.18;

const EXISTS_SALT = 0x7a1;
const TIER_SALT = 0x7a2;
const POS_X_SALT = 0x7a3;
const POS_Z_SALT = 0x7a4;
const REWARD_SALT = 0x7a5;

interface RewardRule {
  readonly itemId: string;
  readonly min: number;
  readonly max: number;
}

/** Per-tier reward rules; counts are rolled deterministically per treasure. */
const REWARD_TABLE: Record<TreasureTier, readonly RewardRule[]> = {
  common: [{ itemId: "coin", min: 5, max: 15 }],
  rare: [
    { itemId: "coin", min: 15, max: 40 },
    { itemId: "gem", min: 1, max: 2 },
  ],
  legendary: [
    { itemId: "gem", min: 2, max: 5 },
    { itemId: "relic", min: 1, max: 1 },
  ],
};

function tierFor(roll: number): TreasureTier {
  if (roll < 0.05) return "legendary";
  if (roll < 0.25) return "rare";
  return "common";
}

function rollCount(rule: RewardRule, roll: number): number {
  const span = rule.max - rule.min + 1;
  return rule.min + Math.min(span - 1, Math.floor(roll * span));
}

function rewardFor(tier: TreasureTier, seed: number, cx: number, cz: number): ItemStack[] {
  return REWARD_TABLE[tier].map((rule, i) => ({
    itemId: rule.itemId,
    count: rollCount(rule, hashUnitFloat(seed, cx, cz, REWARD_SALT + i)),
  }));
}

/** The treasure in cell (cx, cz), or null when the cell holds none. */
export function treasureInCell(seed: number, cx: number, cz: number): HiddenTreasure | null {
  if (hashUnitFloat(seed, cx, cz, EXISTS_SALT) >= TREASURE_DENSITY) return null;
  const tier = tierFor(hashUnitFloat(seed, cx, cz, TIER_SALT));
  const x = (cx + hashUnitFloat(seed, cx, cz, POS_X_SALT)) * TREASURE_CELL_M;
  const z = (cz + hashUnitFloat(seed, cx, cz, POS_Z_SALT)) * TREASURE_CELL_M;
  return {
    id: `treasure:${seed}:${cx}:${cz}`,
    position: [x, 0, z],
    tier,
    reward: rewardFor(tier, seed, cx, cz),
  };
}

export function worldToTreasureCell(coord: number): number {
  return Math.floor(coord / TREASURE_CELL_M);
}

/**
 * Every treasure within `radiusCells` cells of world position (x, z). Radius is
 * in cells so the [F] streamer can query around the player as chunks load.
 */
export function treasuresNear(
  seed: number,
  x: number,
  z: number,
  radiusCells = 4,
): HiddenTreasure[] {
  const ccx = worldToTreasureCell(x);
  const ccz = worldToTreasureCell(z);
  const found: HiddenTreasure[] = [];
  for (let dz = -radiusCells; dz <= radiusCells; dz++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      const t = treasureInCell(seed, ccx + dx, ccz + dz);
      if (t) found.push(t);
    }
  }
  return found;
}
