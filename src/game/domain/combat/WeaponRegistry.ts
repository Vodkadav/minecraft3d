/**
 * The weapon lookup (E7.0 combat contracts) — a thin derived projection over
 * the item table (mirrors `CreatureRegistry`'s five-table consolidation
 * doc-comment): `WeaponMetadata` already lives on `ItemDefinition.combat`
 * (the single source of truth for an item), this registry just indexes the
 * subset of items that carry it, keyed by item id, for combat call sites
 * that only care "is this item a weapon, and what does it do". An item with
 * no `combat` block is silently NOT a weapon entry — that's not an error.
 */

import type { ItemDefinition, WeaponMetadata } from "../items/ItemDefinition";
import { STARTER_ITEMS } from "../items/starterItems";
import { err, ok, type Result } from "../Result";

export type WeaponError =
  | { readonly kind: "UnknownWeapon"; readonly id: string }
  | { readonly kind: "DuplicateWeapon"; readonly id: string };

export class WeaponRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, WeaponMetadata>) {}

  static create(items: readonly ItemDefinition[]): Result<WeaponRegistry, WeaponError> {
    const byId = new Map<string, WeaponMetadata>();
    for (const item of items) {
      if (!item.combat) continue;
      if (byId.has(item.id)) return err({ kind: "DuplicateWeapon", id: item.id });
      byId.set(item.id, item.combat);
    }
    return ok(new WeaponRegistry(byId));
  }

  get(id: string): Result<WeaponMetadata, WeaponError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownWeapon", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly (readonly [string, WeaponMetadata])[] {
    return [...this.byId.entries()];
  }
}

/** Composition-root singleton — mirrors `CREATURE_REGISTRY`/`PROJECTILE_REGISTRY`:
 *  every item with a `combat` block in `STARTER_ITEMS` (the single source of
 *  truth), indexed once here. Consumed host-side by melee resolution
 *  (`SpawnFieldView`, E7.1), ranged/aimed attacks (E7.2), and the AoE/thrown
 *  "bomb" item (E7.4); reads `STARTER_ITEMS`, so every stream's weapon items
 *  are included automatically. */
export const WEAPON_REGISTRY: WeaponRegistry = unwrap(WeaponRegistry.create(STARTER_ITEMS));

function unwrap(result: Result<WeaponRegistry, WeaponError>): WeaponRegistry {
  if (!result.ok) throw new Error(`bad starter weapon table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
