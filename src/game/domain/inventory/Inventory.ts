/**
 * A fixed-capacity slot inventory. Every operation is pure: it returns a Result
 * carrying a NEW Inventory (immutable) or a typed error — expected failures like
 * "full" or "not enough" are values, never thrown (err-explicit-result-handling).
 *
 * Stack sizes are governed by the {@link ItemRegistry}, so the inventory never
 * has to duplicate item metadata — it composes the registry (arch: reuse, don't
 * duplicate).
 */

import { err, isOk, ok, type Result } from "../Result";
import type { ItemRegistry } from "../items/ItemRegistry";

export interface ItemStack {
  readonly itemId: string;
  readonly count: number;
}

export type Slot = ItemStack | null;

export type InventoryError =
  | { readonly kind: "UnknownItem"; readonly id: string }
  | { readonly kind: "InventoryFull"; readonly itemId: string; readonly remaining: number }
  | {
      readonly kind: "NotEnoughItems";
      readonly itemId: string;
      readonly have: number;
      readonly want: number;
    }
  | { readonly kind: "SlotOutOfRange"; readonly index: number }
  | { readonly kind: "SlotEmpty"; readonly index: number }
  | { readonly kind: "InvalidSplit"; readonly index: number; readonly count: number }
  | { readonly kind: "SlotMismatch"; readonly from: number; readonly to: number };

export class Inventory {
  private constructor(
    private readonly registry: ItemRegistry,
    private readonly _slots: readonly Slot[],
  ) {}

  static empty(registry: ItemRegistry, capacity: number): Inventory {
    return new Inventory(registry, Array.from({ length: capacity }, () => null));
  }

  static fromSlots(
    registry: ItemRegistry,
    slots: readonly Slot[],
  ): Result<Inventory, InventoryError> {
    for (const slot of slots) {
      if (slot === null) continue;
      const def = registry.get(slot.itemId);
      if (!isOk(def)) return err({ kind: "UnknownItem", id: slot.itemId });
      if (slot.count < 1 || slot.count > def.value.maxStackSize) {
        return err({ kind: "InvalidSplit", index: slots.indexOf(slot), count: slot.count });
      }
    }
    return ok(new Inventory(registry, slots.map((s) => (s ? { ...s } : null))));
  }

  get capacity(): number {
    return this._slots.length;
  }

  get slots(): readonly Slot[] {
    return this._slots;
  }

  count(itemId: string): number {
    return this._slots.reduce((n, s) => (s?.itemId === itemId ? n + s.count : n), 0);
  }

  totalCount(): number {
    return this._slots.reduce((n, s) => (s ? n + s.count : n), 0);
  }

  has(itemId: string, count: number): boolean {
    return this.count(itemId) >= count;
  }

  add(itemId: string, count: number): Result<Inventory, InventoryError> {
    const def = this.registry.get(itemId);
    if (!isOk(def)) return err({ kind: "UnknownItem", id: itemId });
    const max = def.value.maxStackSize;

    const next = this._slots.map((s) => (s ? { ...s } : null));
    let remaining = count;

    for (let i = 0; i < next.length && remaining > 0; i++) {
      const slot = next[i];
      if (slot && slot.itemId === itemId && slot.count < max) {
        const room = max - slot.count;
        const moved = Math.min(room, remaining);
        next[i] = { itemId, count: slot.count + moved };
        remaining -= moved;
      }
    }
    for (let i = 0; i < next.length && remaining > 0; i++) {
      if (next[i] === null) {
        const moved = Math.min(max, remaining);
        next[i] = { itemId, count: moved };
        remaining -= moved;
      }
    }

    if (remaining > 0) return err({ kind: "InventoryFull", itemId, remaining });
    return ok(new Inventory(this.registry, next));
  }

  remove(itemId: string, count: number): Result<Inventory, InventoryError> {
    const have = this.count(itemId);
    if (have < count) return err({ kind: "NotEnoughItems", itemId, have, want: count });

    const next = this._slots.map((s) => (s ? { ...s } : null));
    let remaining = count;
    for (let i = 0; i < next.length && remaining > 0; i++) {
      const slot = next[i];
      if (slot && slot.itemId === itemId) {
        const taken = Math.min(slot.count, remaining);
        remaining -= taken;
        next[i] = slot.count - taken > 0 ? { itemId, count: slot.count - taken } : null;
      }
    }
    return ok(new Inventory(this.registry, next));
  }

  split(index: number, count: number): Result<Inventory, InventoryError> {
    const slot = this.slotAt(index);
    if (!isOk(slot)) return slot;
    const source = slot.value;
    if (count < 1 || count >= source.count) {
      return err({ kind: "InvalidSplit", index, count });
    }
    const target = this._slots.findIndex((s) => s === null);
    if (target === -1) {
      return err({ kind: "InventoryFull", itemId: source.itemId, remaining: count });
    }
    const next = this._slots.map((s) => (s ? { ...s } : null));
    next[index] = { itemId: source.itemId, count: source.count - count };
    next[target] = { itemId: source.itemId, count };
    return ok(new Inventory(this.registry, next));
  }

  merge(from: number, to: number): Result<Inventory, InventoryError> {
    const src = this.slotAt(from);
    if (!isOk(src)) return src;
    const dst = this.slotAt(to);
    if (!isOk(dst)) return dst;
    if (src.value.itemId !== dst.value.itemId) return err({ kind: "SlotMismatch", from, to });

    const def = this.registry.get(src.value.itemId);
    if (!isOk(def)) return err({ kind: "UnknownItem", id: src.value.itemId });
    const max = def.value.maxStackSize;
    const moved = Math.min(max - dst.value.count, src.value.count);

    const next = this._slots.map((s) => (s ? { ...s } : null));
    next[to] = { itemId: dst.value.itemId, count: dst.value.count + moved };
    const leftover = src.value.count - moved;
    next[from] = leftover > 0 ? { itemId: src.value.itemId, count: leftover } : null;
    return ok(new Inventory(this.registry, next));
  }

  move(from: number, to: number): Result<Inventory, InventoryError> {
    const src = this.slotAt(from);
    if (!isOk(src)) return src;
    if (!this.inRange(to)) return err({ kind: "SlotOutOfRange", index: to });

    const dst = this._slots[to];
    if (dst !== null && dst.itemId === src.value.itemId) return this.merge(from, to);

    const next = this._slots.map((s) => (s ? { ...s } : null));
    next[to] = { ...src.value };
    next[from] = dst ? { ...dst } : null;
    return ok(new Inventory(this.registry, next));
  }

  private inRange(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this._slots.length;
  }

  private slotAt(index: number): Result<ItemStack, InventoryError> {
    if (!this.inRange(index)) return err({ kind: "SlotOutOfRange", index });
    const slot = this._slots[index];
    if (slot === null) return err({ kind: "SlotEmpty", index });
    return ok(slot);
  }
}
