/**
 * E7.8 loot pools & difficulty scaling. A `LootPool` is a small set of
 * rarity-tagged entries (reusing `HiddenTreasure`'s `TreasureTier` vocabulary
 * for consistency); `rollLootPool` resolves ONE bonus item from a pool as a
 * pure function of (pool, roll, danger) — same shape as `Combat.lootFor`'s
 * existing `roll ∈ [0,1)` convention (the engine derives it from the world
 * hash so every peer agrees, ADR 0004 host-authoritative resolution).
 * `danger` folds together the difficulty setting, the creature's own
 * toughness, and night/biome risk into one scalar that shifts the tier roll
 * toward rarer entries — never Math.random(), never Date.now(), so replaying
 * the same inputs always replays the same drop.
 */

import type { ItemStack } from "../inventory/Inventory";
import type { TreasureTier } from "../treasure/HiddenTreasure";
import type { Difficulty } from "../settings/Difficulty";

export interface LootPoolEntry {
  readonly itemId: string;
  readonly min: number;
  readonly max: number;
  readonly tier: TreasureTier;
}

export type LootPool = readonly LootPoolEntry[];

// Base tier-roll thresholds (danger = 0) and how much each unit of danger
// widens them. Legendary widens fastest — a hard-fought kill's drama beat is
// a better drop, not just a faster common one. Both bands only ever grow, so
// a tougher encounter is never worse than an easy one for the same roll.
const BASE_LEGENDARY_P = 0.03;
const BASE_RARE_P = 0.15;
const LEGENDARY_GAIN = 0.02;
const RARE_GAIN = 0.04;

/** Deterministic rarity tier for one roll at a given danger level. */
export function lootTierFor(roll: number, danger: number): TreasureTier {
  const d = Math.max(0, danger);
  const legendaryP = BASE_LEGENDARY_P + LEGENDARY_GAIN * d;
  const rareUpper = legendaryP + BASE_RARE_P + RARE_GAIN * d;
  if (roll < legendaryP) return "legendary";
  if (roll < rareUpper) return "rare";
  return "common";
}

/**
 * One bonus drop from `pool`, or null when the pool is empty. Rolls a rarity
 * tier first, then an item within that tier, then a count within the item's
 * min/max — each sub-decision derived from `roll` via a distinct multiplier
 * (the same decorrelation idiom `Combat.lootFor` already uses), so a single
 * float still determines the whole outcome. A tier with no entries in this
 * particular pool falls back to the full pool rather than coming back empty.
 */
export function rollLootPool(pool: LootPool, roll: number, danger: number): ItemStack | null {
  if (pool.length === 0) return null;
  const tier = lootTierFor(roll, danger);
  const atTier = pool.filter((e) => e.tier === tier);
  const candidates = atTier.length > 0 ? atTier : pool;
  const pickRoll = (roll * 7919) % 1;
  const entry = candidates[Math.floor(pickRoll * candidates.length) % candidates.length]!;
  const span = entry.max - entry.min + 1;
  const qtyRoll = (roll * 104_729) % 1;
  const count = entry.min + Math.min(span - 1, Math.floor(qtyRoll * span));
  return { itemId: entry.itemId, count };
}

export interface DangerInputs {
  readonly difficulty: Difficulty;
  /** 0 (harmless) .. 3 (apex) — see {@link creatureTierFromStats}. */
  readonly creatureTier: number;
  readonly isNight: boolean;
  /** Extra multiplier for a dangerous biome; default 1 (no per-biome danger
   *  table exists yet — callers that have one can fold it in here). */
  readonly biomeDangerMult?: number;
}

const DIFFICULTY_DANGER: Readonly<Record<Difficulty, number>> = { peaceful: 0, normal: 1, hard: 2 };

/** Composes the difficulty setting + creature tier + night into one danger
 *  scalar for {@link lootTierFor}/{@link rollLootPool}. */
export function dangerScore(inputs: DangerInputs): number {
  const base = DIFFICULTY_DANGER[inputs.difficulty] + inputs.creatureTier + (inputs.isNight ? 1 : 0);
  return base * (inputs.biomeDangerMult ?? 1);
}

/** Bands a creature's `maxHealth` (its established toughness stat) into a
 *  0..3 danger tier — no schema change to `CreatureDefinition` needed. */
export function creatureTierFromStats(stats: { readonly maxHealth: number }): number {
  if (stats.maxHealth >= 50) return 3;
  if (stats.maxHealth >= 30) return 2;
  if (stats.maxHealth >= 15) return 1;
  return 0;
}
