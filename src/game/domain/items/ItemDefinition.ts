/**
 * A data-driven item definition — pure domain data, no behaviour. The registry
 * ({@link ItemRegistry}) owns lookup and query; a definition is just the record.
 *
 * `tags` classify an item for cross-cutting queries (e.g. "wood", "tool",
 * "smeltable"); `tier` is the progression gate a recipe checks against.
 */
export interface ItemDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly maxStackSize: number;
  readonly tags: readonly string[];
  readonly tier: number;
}
