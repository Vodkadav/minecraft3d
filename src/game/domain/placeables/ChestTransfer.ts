/**
 * Chest deposit/withdraw by item id + count (Workstream 8.1/S7b) — the
 * host-authoritative counterpart to the local-UI `CrossInventoryTransfer`
 * (which moves a stack by slot index between two live `Inventory` instances,
 * perfect for solo mouse/keyboard drag-drop). A networked placeable intent
 * only carries `itemId`/`count` (Protocol's `PlaceableInteractMsg`), not a
 * slot index, so the host resolves it against the chest's serialized state
 * via the registry's `add`/`remove` — same atomic-on-failure contract.
 */

import { isOk, ok, type Result } from "../Result";
import { Inventory, type InventoryError, type Slot } from "../inventory/Inventory";
import type { ItemRegistry } from "../items/ItemRegistry";

export interface ChestState {
  readonly capacity: number;
  readonly slots: readonly Slot[];
}

function toInventory(state: ChestState, registry: ItemRegistry): Result<Inventory, InventoryError> {
  return Inventory.fromSlots(registry, state.slots);
}

function toState(inventory: Inventory): ChestState {
  return { capacity: inventory.capacity, slots: inventory.slots };
}

export function depositToChest(
  chest: ChestState,
  registry: ItemRegistry,
  itemId: string,
  count: number,
): Result<ChestState, InventoryError> {
  const inv = toInventory(chest, registry);
  if (!isOk(inv)) return inv;
  const added = inv.value.add(itemId, count);
  if (!isOk(added)) return added;
  return ok(toState(added.value));
}

export interface WithdrawResult {
  readonly chest: ChestState;
  readonly itemId: string;
  readonly count: number;
}

export function withdrawFromChest(
  chest: ChestState,
  registry: ItemRegistry,
  itemId: string,
  count: number,
): Result<WithdrawResult, InventoryError> {
  const inv = toInventory(chest, registry);
  if (!isOk(inv)) return inv;
  const removed = inv.value.remove(itemId, count);
  if (!isOk(removed)) return removed;
  return ok({ chest: toState(removed.value), itemId, count });
}
