/**
 * The creature catalogue — loads a flat definition table once and answers
 * lookup (by id), mirroring `ItemRegistry` (domain/items). Construction is
 * fallible: a table with a duplicate id is rejected rather than silently
 * last-wins (err-explicit-result-handling).
 *
 * Consolidation choice (E0.2): SpawnField.SPAWN_SPECIES, Combat.CREATURE_STATS,
 * CreatureBrain.TEMPERAMENT, Taming.TAMING_RULES and
 * spawn/SpawnPlacement.SPECIES_VISUAL all keep their existing exported shapes
 * — each is now a thin `Object.fromEntries(CREATURE_REGISTRY.all()...)`
 * projection of this registry instead of a hand-maintained table. That was
 * the smaller diff: those five names are imported by value (not by type) in
 * several non-domain call sites (SpawnFieldView.ts, SpawnPlacement.ts's own
 * tests), so deriving them left every caller and every existing test
 * unmodified, versus migrating call sites to a new API across layers.
 */

import { err, ok, type Result } from "../Result";
import type { CreatureDefinition } from "./CreatureDefinition";
import { STARTER_CREATURES } from "./starterCreatures";

export type CreatureError =
  | { readonly kind: "UnknownCreature"; readonly id: string }
  | { readonly kind: "DuplicateCreature"; readonly id: string };

export class CreatureRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, CreatureDefinition>) {}

  static create(defs: readonly CreatureDefinition[]): Result<CreatureRegistry, CreatureError> {
    const byId = new Map<string, CreatureDefinition>();
    for (const d of defs) {
      if (byId.has(d.id)) return err({ kind: "DuplicateCreature", id: d.id });
      byId.set(d.id, d);
    }
    return ok(new CreatureRegistry(byId));
  }

  get(id: string): Result<CreatureDefinition, CreatureError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownCreature", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Insertion order preserved (Map iteration order) — the five adapters rely
   *  on this to keep their derived tables' species ordering stable. */
  all(): readonly CreatureDefinition[] {
    return [...this.byId.values()];
  }
}

/**
 * The default, built-in-data registry. `STARTER_CREATURES` is a static,
 * compile-time-known table — a duplicate id in it is a programmer error, not
 * a recoverable runtime failure, so it fails fast at import time (same
 * pattern the composition roots use for `ItemRegistry.create(STARTER_ITEMS)`).
 */
export const CREATURE_REGISTRY: CreatureRegistry = unwrap(CreatureRegistry.create(STARTER_CREATURES));

function unwrap(result: Result<CreatureRegistry, CreatureError>): CreatureRegistry {
  if (!result.ok) throw new Error(`bad starter creature table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
