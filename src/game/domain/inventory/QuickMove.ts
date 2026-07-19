/**
 * Quick-move (Workstream 4, task 4.1): double-click a slot to send its stack
 * to the "other" zone of the SAME inventory — the hotbar is just the first
 * `hotbarSize` slots of the player's one Inventory (see Hotbar.ts), so a
 * quick-move is a same-inventory move to the first fitting slot in the
 * opposite zone. Composes `Inventory.fromSlots`/`remove` rather than
 * reinventing stacking (arch: reuse, don't duplicate).
 */

import { err, isOk, ok, type Result } from "../Result";
import { Inventory, type InventoryError } from "./Inventory";
import type { ItemRegistry } from "../items/ItemRegistry";

/** True if `index` is in the hotbar zone (0..hotbarSize-1). */
function inHotbar(index: number, hotbarSize: number): boolean {
  return index >= 0 && index < hotbarSize;
}

/**
 * Moves the stack at `fromIndex` into the opposite zone: hotbar -> backpack,
 * backpack -> hotbar. A no-op (returns the same inventory, `ok`) if the slot
 * is empty or the opposite zone has no room at all.
 */
export function quickMove(
  registry: ItemRegistry,
  inventory: Inventory,
  fromIndex: number,
  hotbarSize: number,
): Result<Inventory, InventoryError> {
  if (fromIndex < 0 || fromIndex >= inventory.capacity) {
    return err({ kind: "SlotOutOfRange", index: fromIndex });
  }
  const slot = inventory.slots[fromIndex];
  if (!slot) return err({ kind: "SlotEmpty", index: fromIndex });

  const def = registry.get(slot.itemId);
  if (!isOk(def)) return err({ kind: "UnknownItem", id: slot.itemId });
  const max = def.value.maxStackSize;

  const targetIsHotbar = !inHotbar(fromIndex, hotbarSize);
  const zoneStart = targetIsHotbar ? 0 : hotbarSize;
  const zoneEnd = targetIsHotbar ? hotbarSize : inventory.capacity;

  const withoutSource = inventory.slots.map((s, i) => (i === fromIndex ? null : s ? { ...s } : null));
  let remaining = slot.count;

  for (let i = zoneStart; i < zoneEnd && remaining > 0; i++) {
    const s = withoutSource[i];
    if (s && s.itemId === slot.itemId && s.count < max) {
      const room = max - s.count;
      const moved = Math.min(room, remaining);
      withoutSource[i] = { itemId: slot.itemId, count: s.count + moved };
      remaining -= moved;
    }
  }
  for (let i = zoneStart; i < zoneEnd && remaining > 0; i++) {
    if (withoutSource[i] === null) {
      const moved = Math.min(max, remaining);
      withoutSource[i] = { itemId: slot.itemId, count: moved };
      remaining -= moved;
    }
  }

  if (remaining > 0) {
    if (remaining === slot.count) return ok(inventory); // no room at all — no-op
    // partial fit: leave what didn't fit behind in the source slot
    withoutSource[fromIndex] = { itemId: slot.itemId, count: remaining };
  }

  return Inventory.fromSlots(registry, withoutSource);
}
