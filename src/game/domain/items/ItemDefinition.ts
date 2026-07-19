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

export interface ItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly maxStackSize: number;
  readonly tags: readonly string[];
  readonly tier: number;
  /** Present iff this item can be eaten. */
  readonly food?: FoodMetadata;
}
