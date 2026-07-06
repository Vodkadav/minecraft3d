/**
 * Combat/death domain (plan 6.6 [O]). Pure: health state, damage
 * application with a single death event, and deterministic loot rolls
 * (roll ∈ [0,1) is supplied by the caller — the engine derives it from the
 * world hash so peers agree). Effects/animation are the [F] half.
 */

import type { ItemStack } from "../inventory/Inventory";

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

/** Keyed by spawn-species id (SPAWN_SPECIES `kind: "creature"`). */
export const CREATURE_STATS: Readonly<Record<string, CreatureStats>> = {
  deer: {
    maxHealth: 20,
    damage: 0,
    loot: [
      { itemId: "meat", min: 1, max: 2 },
      { itemId: "hide", min: 1, max: 1 },
    ],
  },
  wolf: {
    maxHealth: 35,
    damage: 6,
    loot: [
      { itemId: "meat", min: 2, max: 3 },
      { itemId: "hide", min: 1, max: 2 },
    ],
  },
};

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

/** Deterministic loot for a death; roll ∈ [0,1) drives every count. */
export function lootFor(species: string, roll: number): ItemStack[] {
  const stats = CREATURE_STATS[species];
  if (!stats) return [];
  return stats.loot.map((rule, i) => {
    const span = rule.max - rule.min + 1;
    // spread one roll across rules so a single float decides the whole drop
    const r = (roll * 7919 * (i + 1)) % 1;
    return { itemId: rule.itemId, count: rule.min + Math.min(span - 1, Math.floor(r * span)) };
  });
}
