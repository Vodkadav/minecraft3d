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

// NOTE: no `WEAPON_REGISTRY` starter-data singleton yet — no shipped item
// carries `combat` metadata as of E7.0 (every pre-existing item stays
// untouched per the slice's scope). The first combat stream to add a weapon
// item to `starterItems.ts` should also add
// `export const WEAPON_REGISTRY = unwrap(WeaponRegistry.create(STARTER_ITEMS));`
// here, mirroring `CREATURE_REGISTRY`/`PROJECTILE_REGISTRY`'s composition-root
// pattern — deferred rather than built speculatively against an empty table.
