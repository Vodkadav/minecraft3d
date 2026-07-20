/**
 * A data-driven item definition — pure domain data, no behaviour. The registry
 * ({@link ItemRegistry}) owns lookup and query; a definition is just the record.
 *
 * `tags` classify an item for cross-cutting queries (e.g. "wood", "tool",
 * "smeltable"); `tier` is the progression gate a recipe checks against.
 */
/** Consumable metadata (Workstream 5.2) — present only on food items. */
export interface FoodMetadata {
  /** Hunger restored, 0..HUNGER_MAX (domain/survival/Survival). */
  readonly hungerRestore: number;
  /** Health restored, capped at PLAYER_MAX_HEALTH by the composing call site. */
  readonly healthRestore: number;
}

/**
 * Weapon/ability metadata (E7.0 combat contracts) — present only on items that
 * can be equipped and used to fight. Additive: every pre-existing item stays
 * untouched (no `combat` field), so this is purely opt-in for new weapon/
 * spell/deployable items the combat streams (E7.1-E7.6) add later.
 */
export interface WeaponMetadata {
  readonly kind: "melee" | "ranged" | "thrown" | "spell" | "deployable";
  readonly damage: number;
  /** Hits/casts/throws per second ceiling — drives the cooldown meter. */
  readonly attackSpeed: number;
  /** Melee cone reach (m). */
  readonly reach?: number;
  /** Melee assist cone half-angle (degrees). */
  readonly coneDegrees?: number;
  /** ProjectileRegistry id (ranged/thrown/spell). */
  readonly projectile?: string;
  /** Item consumed per shot (ranged); absent = infinite ammo. */
  readonly ammoItemId?: string;
  /** "focus"/mana cost for spells. */
  readonly resourceCost?: number;
  /** AoeRegistry id (explosives/spells). */
  readonly aoe?: string;
  /** DeployableRegistry id (mines/traps/grenades). */
  readonly deployable?: string;
  readonly damageType: DamageType;
  /** FeelEventId to fire on hit — kept as a plain string (not `FeelEventId`)
   *  so `domain/items` stays decoupled from `domain/feel`, matching how
   *  `Protocol.ts` stays decoupled from the domain modules it validates for. */
  readonly feelEvent: string;
}

/** Cozy stance: damage types drive VFX/flavor, not a debuff-build web — any
 *  affinity table stays a strictly optional, default-1.0 follow-up. */
export type DamageType = "physical" | "spark" | "frost" | "nature" | "boom";

export interface ItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly maxStackSize: number;
  readonly tags: readonly string[];
  readonly tier: number;
  /** Present iff this item can be eaten. */
  readonly food?: FoodMetadata;
  /** Present iff this item can be equipped and used to fight (E7.0). */
  readonly combat?: WeaponMetadata;
}
