/**
 * Two-inventory transfer (Workstream 4, task 4.3): moves a stack from one
 * Inventory's slot into another Inventory — the seam a future storage chest
 * (Workstream 8) needs to move items between the player's inventory and a
 * chest's. Pure and atomic: on any failure both inventories are returned
 * unchanged (err-explicit-result-handling). Composes `remove`/`add` rather
 * than reaching into slot internals — the destination lands wherever `add`
 * finds room, exactly like picking the stack up and placing it normally.
 */

import { err, isOk, ok, type Result } from "../Result";
import type { Inventory, InventoryError } from "./Inventory";

export interface TransferResult {
  readonly from: Inventory;
  readonly to: Inventory;
}

/** Moves the whole stack at `fromIndex` in `from` into `to`. */
export function transferBetween(
  from: Inventory,
  to: Inventory,
  fromIndex: number,
): Result<TransferResult, InventoryError> {
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= from.capacity) {
    return err({ kind: "SlotOutOfRange", index: fromIndex });
  }
  const slot = from.slots[fromIndex];
  if (!slot) return err({ kind: "SlotEmpty", index: fromIndex });

  const placed = to.add(slot.itemId, slot.count);
  if (!isOk(placed)) return placed;

  const removed = from.remove(slot.itemId, slot.count);
  if (!isOk(removed)) return removed;

  return ok({ from: removed.value, to: placed.value });
}
