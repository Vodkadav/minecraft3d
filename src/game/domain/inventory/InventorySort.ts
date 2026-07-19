/**
 * Sort predicates + Diablo-4-style autosort/compaction over the existing
 * {@link Inventory} model (Workstream E4.1). Autosort merges every partial
 * stack of the same item into the fewest full stacks (respecting
 * `maxStackSize`), then lays the result out in `key` order starting at slot
 * 0, leaving empty slots at the end.
 *
 * Total item counts are always conserved and capacity never shrinks, so
 * compaction can only ever need the same or fewer slots than the inventory
 * already occupied — autosort can never fail and returns the sorted
 * `Inventory` directly rather than a `Result`. An unknown item id reaching
 * this module would mean an already-invalid `Inventory` slipped past
 * `Inventory.fromSlots`'s own validation — a programmer error, not an
 * expected failure, so it throws rather than adding a needless Result path
 * (err-explicit-result-handling).
 */

import { isOk } from "../Result";
import { Inventory, type ItemStack, type Slot } from "./Inventory";
import type { ItemDefinition } from "../items/ItemDefinition";
import type { ItemRegistry } from "../items/ItemRegistry";

export type SortKey = "tier" | "tag" | "name" | "count";

export const SORT_KEYS: readonly SortKey[] = ["tier", "tag", "name", "count"];

function defOf(registry: ItemRegistry, itemId: string): ItemDefinition {
  const r = registry.get(itemId);
  if (!isOk(r)) {
    throw new Error(`InventorySort: unknown item "${itemId}" (invariant violation)`);
  }
  return r.value;
}

function nameOf(registry: ItemRegistry, itemId: string): string {
  return defOf(registry, itemId).displayName.toLowerCase();
}

/** A comparator for `key`, usable directly on any `{itemId, count}` pair — the
 *  "sort predicates" half of E4.1, reusable outside autosort (e.g. a future
 *  sorted read-only view). Ties always break on item name for a stable,
 *  deterministic order regardless of input order. */
export function compareStacks(
  registry: ItemRegistry,
  key: SortKey,
): (a: ItemStack, b: ItemStack) => number {
  return (a, b) => {
    const nameCmp = () => nameOf(registry, a.itemId).localeCompare(nameOf(registry, b.itemId));
    switch (key) {
      case "tier":
        return defOf(registry, a.itemId).tier - defOf(registry, b.itemId).tier || nameCmp();
      case "tag": {
        const tagA = defOf(registry, a.itemId).tags[0] ?? "";
        const tagB = defOf(registry, b.itemId).tags[0] ?? "";
        return tagA.localeCompare(tagB) || nameCmp();
      }
      case "name":
        return nameCmp();
      case "count":
        return b.count - a.count || nameCmp();
    }
  };
}

/** Merges + sorts every stack in `inventory`, returning a new compacted,
 *  ordered Inventory of the same capacity. Defaults to tier order. */
export function autosort(registry: ItemRegistry, inventory: Inventory, key: SortKey = "tier"): Inventory {
  const totals = new Map<string, number>();
  for (const slot of inventory.slots) {
    if (!slot) continue;
    totals.set(slot.itemId, (totals.get(slot.itemId) ?? 0) + slot.count);
  }

  const stacks: ItemStack[] = [];
  for (const [itemId, total] of totals) {
    const max = defOf(registry, itemId).maxStackSize;
    let remaining = total;
    while (remaining > 0) {
      const take = Math.min(max, remaining);
      stacks.push({ itemId, count: take });
      remaining -= take;
    }
  }
  stacks.sort(compareStacks(registry, key));

  const nextSlots: Slot[] = [...stacks];
  while (nextSlots.length < inventory.capacity) nextSlots.push(null);

  const result = Inventory.fromSlots(registry, nextSlots);
  if (!isOk(result)) {
    throw new Error(`InventorySort: autosort produced an invalid inventory (${result.error.kind})`);
  }
  return result.value;
}
