/**
 * The item catalogue — loads a flat definition table once and answers lookup
 * (by id) and query (by tag / tier). Unknown-id lookups are Result values, not
 * exceptions (err-explicit-result-handling). Construction is fallible too: a
 * table with a duplicate id is rejected rather than silently last-wins.
 */

import { err, ok, type Result } from "../Result";
import type { ItemDefinition } from "./ItemDefinition";

export type ItemError =
  | { readonly kind: "UnknownItem"; readonly id: string }
  | { readonly kind: "DuplicateItem"; readonly id: string };

export class ItemRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, ItemDefinition>) {}

  static create(defs: readonly ItemDefinition[]): Result<ItemRegistry, ItemError> {
    const byId = new Map<string, ItemDefinition>();
    for (const d of defs) {
      if (byId.has(d.id)) return err({ kind: "DuplicateItem", id: d.id });
      byId.set(d.id, d);
    }
    return ok(new ItemRegistry(byId));
  }

  get(id: string): Result<ItemDefinition, ItemError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownItem", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  byTag(tag: string): readonly ItemDefinition[] {
    return [...this.byId.values()].filter((d) => d.tags.includes(tag));
  }

  byTier(tier: number): readonly ItemDefinition[] {
    return [...this.byId.values()].filter((d) => d.tier === tier);
  }

  all(): readonly ItemDefinition[] {
    return [...this.byId.values()];
  }
}
