/**
 * Storage chest placeable (Workstream 8.1) — its state IS a plain
 * `domain/inventory/Inventory`, reusing the existing model instead of a
 * bespoke bag. Deposit/withdraw compose `CrossInventoryTransfer.transferBetween`
 * (Workstream 4 seam); this module only owns the chest's capacity + creation.
 * Persists via the same slot-array shape `InventoryPersistence` already saves.
 */

import { Inventory } from "../inventory/Inventory";
import type { ItemRegistry } from "../items/ItemRegistry";

export const CHEST_CAPACITY = 20;

export function createChestInventory(registry: ItemRegistry): Inventory {
  return Inventory.empty(registry, CHEST_CAPACITY);
}
