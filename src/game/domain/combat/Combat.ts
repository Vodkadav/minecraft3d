/**
 * Combat/death domain (plan 6.6 [O]). Pure: health state, damage
 * application with a single death event, and deterministic loot rolls
 * (roll ∈ [0,1) is supplied by the caller — the engine derives it from the
 * world hash so peers agree). Effects/animation are the [F] half.
 *
 * E7.8: `lootFor` also grants one bonus rarity-tier drop for species listed
 * in `CreatureLootPools` — the flat per-species `loot` rules above stay
 * completely unchanged (a species with no pool entry is byte-identical to
 * pre-E7.8 behavior), so this is additive, not a rebalance.
 */

import type { ItemStack } from "../inventory/Inventory";
import { CREATURE_REGISTRY } from "../creatures/CreatureRegistry";
import { CREATURE_LOOT_POOLS } from "../creatures/CreatureLootPools";
import { creatureTierFromStats, dangerScore, rollLootPool } from "../loot/LootTable";
import type { Difficulty } from "../settings/Difficulty";

export interface CreatureStats {
  readonly maxHealth: number;
  /** Damage this creature deals per hit when aggressive (0 = never attacks). */
  readonly damage: number;
  readonly loot: readonly LootRule[];
}

export interface LootRule {
  readonly itemId: string;
  readonly min: number;
  readonly max: number;
}

/** Keyed by spawn-species id (SPAWN_SPECIES `kind: "creature"`). Derived from
 *  CreatureRegistry (E0.2) — see its doc comment for why this stays a thin
 *  projection instead of a hand-maintained table. */
export const CREATURE_STATS: Readonly<Record<string, CreatureStats>> = Object.fromEntries(
  CREATURE_REGISTRY.all().map((c) => [c.id, c.stats]),
);

export interface CombatState {
  readonly species: string;
  readonly health: number;
}

export function spawnCombatState(species: string): CombatState {
  return { species, health: CREATURE_STATS[species]?.maxHealth ?? 1 };
}

export interface DamageResult {
  readonly state: CombatState;
  /** True exactly once — on the hit that brings health to zero. */
  readonly died: boolean;
}

export function applyDamage(state: CombatState, amount: number): DamageResult {
  if (amount <= 0 || state.health <= 0) return { state, died: false };
  const health = Math.max(0, state.health - amount);
  return { state: { ...state, health }, died: health === 0 };
}

/** E7.8: difficulty/encounter inputs for the bonus loot-pool roll. Optional —
 *  omitting it (the pre-E7.8 call shape) resolves against normal difficulty,
 *  daytime, no biome danger, which is exactly today's baseline. */
export interface LootRollContext {
  readonly difficulty: Difficulty;
  readonly isNight: boolean;
  readonly biomeDangerMult?: number;
}

const DEFAULT_LOOT_CONTEXT: LootRollContext = { difficulty: "normal", isNight: false };

/**
 * Deterministic loot for a death; roll ∈ [0,1) drives every count. Species
 * with a `CreatureLootPools` entry get one additional bonus drop, rarity-
 * shifted by `context` (LootTable.dangerScore) — everyone else is unchanged
 * from the pre-E7.8 flat-rule behavior.
 */
export function lootFor(
  species: string,
  roll: number,
  context: LootRollContext = DEFAULT_LOOT_CONTEXT,
): ItemStack[] {
  const stats = CREATURE_STATS[species];
  if (!stats) return [];
  const base = stats.loot.map((rule, i) => {
    const span = rule.max - rule.min + 1;
    // spread one roll across rules so a single float decides the whole drop
    const r = (roll * 7919 * (i + 1)) % 1;
    return { itemId: rule.itemId, count: rule.min + Math.min(span - 1, Math.floor(r * span)) };
  });
  const pool = CREATURE_LOOT_POOLS[species];
  if (!pool) return base;
  const danger = dangerScore({
    difficulty: context.difficulty,
    creatureTier: creatureTierFromStats(stats),
    isNight: context.isNight,
    biomeDangerMult: context.biomeDangerMult,
  });
  // decorrelated from the base rolls above via a distinct large-prime salt
  const bonusRoll = (roll * 1_299_827) % 1;
  const bonus = rollLootPool(pool, bonusRoll, danger);
  return bonus ? [...base, bonus] : base;
}
