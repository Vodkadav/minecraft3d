/**
 * A data-driven creature definition — pure domain data, no behaviour, mirroring
 * {@link ItemDefinition}/`ItemRegistry` (domain/items). Consolidates what today
 * is spread across five separate tables (SpawnField.SPAWN_SPECIES,
 * Combat.CREATURE_STATS, CreatureBrain.TEMPERAMENT, Taming.TAMING_RULES,
 * spawn/SpawnPlacement.SPECIES_VISUAL) — a missing entry in one of those
 * silently degrades a species. One `CreatureDefinition` per species is now the
 * single source of truth; the five tables are thin derived adapters
 * (CreatureRegistry.ts doc comment explains why).
 */

export interface CreatureLootRule {
  readonly itemId: string;
  readonly min: number;
  readonly max: number;
}

export interface CreatureCombatStats {
  readonly maxHealth: number;
  /** Damage this creature deals per hit when aggressive (0 = never attacks). */
  readonly damage: number;
  readonly loot: readonly CreatureLootRule[];
}

export interface CreatureTemperament {
  /** Player distance (m) that triggers the reaction... */
  readonly reactRange: number;
  /** ...which is flee (timid) or aggro (aggressive). */
  readonly aggressive: boolean;
  /** Health fraction below which even an aggressive creature flees. */
  readonly fleeBelowHealth: number;
}

export interface CreatureTamingRule {
  readonly foodItemId: string;
  readonly feedsRequired: number;
  readonly cooldownMs: number;
}

export interface CreatureVisual {
  /** Placeholder primitive until a rigged model loads (CreatureModelLibrary.has()). */
  readonly shape: "box" | "sphere" | "cone";
  readonly color: number;
  /** Uniform size (m) of the primitive. */
  readonly size: number;
  /** Lift above the surface so the primitive sits on, not in, the ground. */
  readonly lift: number;
}

/**
 * Faction grouping for future nameplates (E2.2 — not consumed yet, this field
 * only makes the data available). Derived once, not re-derived per call site:
 * `hostile` when the species is wild-aggressive, else `friendly` when it's
 * tameable, else `neutral`.
 */
export type CreatureDisposition = "friendly" | "neutral" | "hostile";

export interface CreatureDefinition {
  readonly id: string;
  /** Spawn-field kind — always "creature" here; resource nodes are not creatures. */
  readonly kind: "creature";
  /** 0..1 — chance each slot materializes at full density (SpawnField). */
  readonly spawnWeight: number;
  /** Max slots this species rolls per cell, before the density multiplier. */
  readonly maxPerCell: number;
  readonly stats: CreatureCombatStats;
  readonly temperament: CreatureTemperament;
  /** Absent = untameable. */
  readonly taming?: CreatureTamingRule;
  readonly disposition: CreatureDisposition;
  /**
   * Model/visual reference. `id` doubles as the CreatureModelLibrary key
   * (src/spawn/CreatureModels.ts); `visual` is the primitive fallback drawn
   * until/unless a rigged model is loaded for the species. A later slice
   * (E6.3) adds `biomeAffinity` alongside this — left out until then.
   */
  readonly visual: CreatureVisual;
}
