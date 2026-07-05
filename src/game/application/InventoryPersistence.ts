/**
 * Use case: round-trip an owner's inventory through the world save. It reads and
 * writes the open `WorldSaveData.inventories` map (keyed by owner id), depending
 * only on the {@link WorldSaveStore} PORT and pure domain types — never on a
 * concrete store (the composition root injects that). Deserialization validates
 * the untyped blob and degrades to a typed error rather than trusting its shape
 * (err-explicit-result-handling).
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import { Inventory, type Slot } from "../domain/inventory/Inventory";
import type { ItemRegistry } from "../domain/items/ItemRegistry";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

interface SerializedInventory {
  readonly capacity: number;
  readonly slots: readonly Slot[];
}

export type InventoryLoadError =
  | SaveError
  | { readonly kind: "NoInventory"; readonly ownerId: string }
  | { readonly kind: "CorruptInventory"; readonly ownerId: string; readonly detail: string };

function serialize(inventory: Inventory): SerializedInventory {
  return {
    capacity: inventory.capacity,
    slots: inventory.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
  };
}

function parse(raw: unknown, ownerId: string): Result<SerializedInventory, InventoryLoadError> {
  if (typeof raw !== "object" || raw === null || !("slots" in raw) || !("capacity" in raw)) {
    return err({ kind: "CorruptInventory", ownerId, detail: "not an inventory record" });
  }
  const record = raw as { capacity: unknown; slots: unknown };
  if (typeof record.capacity !== "number" || !Array.isArray(record.slots)) {
    return err({ kind: "CorruptInventory", ownerId, detail: "bad capacity or slots" });
  }
  const slots: Slot[] = [];
  for (const entry of record.slots) {
    if (entry === null) {
      slots.push(null);
      continue;
    }
    if (
      typeof entry !== "object" ||
      typeof (entry as { itemId?: unknown }).itemId !== "string" ||
      typeof (entry as { count?: unknown }).count !== "number"
    ) {
      return err({ kind: "CorruptInventory", ownerId, detail: "bad slot entry" });
    }
    const stack = entry as { itemId: string; count: number };
    slots.push({ itemId: stack.itemId, count: stack.count });
  }
  return ok({ capacity: record.capacity, slots });
}

export class InventoryPersistence {
  constructor(
    private readonly store: WorldSaveStore,
    private readonly registry: ItemRegistry,
  ) {}

  async saveInventory(
    worldId: WorldId,
    ownerId: string,
    inventory: Inventory,
  ): Promise<Result<void, SaveError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const inventories = { ...loaded.value.inventories, [ownerId]: serialize(inventory) };
    return this.store.save({ ...loaded.value, inventories, modifiedAt: Date.now() });
  }

  async loadInventory(
    worldId: WorldId,
    ownerId: string,
  ): Promise<Result<Inventory, InventoryLoadError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const raw = loaded.value.inventories[ownerId];
    if (raw === undefined) return err({ kind: "NoInventory", ownerId });

    const parsed = parse(raw, ownerId);
    if (!isOk(parsed)) return parsed;

    const inv = Inventory.fromSlots(this.registry, parsed.value.slots);
    if (!isOk(inv)) {
      return err({ kind: "CorruptInventory", ownerId, detail: `unknown item: ${inv.error.kind}` });
    }
    return ok(inv.value);
  }
}
