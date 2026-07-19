/**
 * The account bank (Phase E4.4): a shared tab that persists across every
 * character/world on the account, plus optional per-character private tabs.
 * Reuses the tested `Inventory` model for slot/stack semantics rather than
 * inventing a second container — a `Bank` is just a named set of independent
 * `Inventory` instances keyed by tab id. Pure domain: no I/O, no engine.
 *
 * `SHARED_BANK_TAB` is the reserved tab id for the account-wide shared tab;
 * any other tab id is treated as a private per-character tab (conventionally
 * the character/owner id) and created lazily on first deposit.
 */

import { isOk, ok, type Result } from "../Result";
import { Inventory, type InventoryError, type Slot } from "../inventory/Inventory";
import type { ItemRegistry } from "../items/ItemRegistry";

export const SHARED_BANK_TAB = "shared";

export interface BankOptions {
  readonly sharedCapacity: number;
  readonly tabCapacity: number;
}

export class Bank {
  private constructor(
    private readonly registry: ItemRegistry,
    private readonly sharedCapacity: number,
    private readonly tabCapacity: number,
    private readonly tabs: ReadonlyMap<string, Inventory>,
  ) {}

  static empty(registry: ItemRegistry, options: BankOptions): Bank {
    const shared = Inventory.empty(registry, options.sharedCapacity);
    return new Bank(
      registry,
      options.sharedCapacity,
      options.tabCapacity,
      new Map([[SHARED_BANK_TAB, shared]]),
    );
  }

  /** Rebuilds a Bank from persisted slot arrays (one per tab id). Validates
   *  every slot against the registry the same way `Inventory.fromSlots` does. */
  static fromTabs(
    registry: ItemRegistry,
    options: BankOptions,
    tabSlots: Readonly<Record<string, readonly Slot[]>>,
  ): Result<Bank, InventoryError> {
    const tabs = new Map<string, Inventory>();
    for (const [tabId, slots] of Object.entries(tabSlots)) {
      const inv = Inventory.fromSlots(registry, slots);
      if (!isOk(inv)) return inv;
      tabs.set(tabId, inv.value);
    }
    if (!tabs.has(SHARED_BANK_TAB)) {
      tabs.set(SHARED_BANK_TAB, Inventory.empty(registry, options.sharedCapacity));
    }
    return ok(new Bank(registry, options.sharedCapacity, options.tabCapacity, tabs));
  }

  private capacityFor(tabId: string): number {
    return tabId === SHARED_BANK_TAB ? this.sharedCapacity : this.tabCapacity;
  }

  /** The live inventory for a tab — an empty one at the configured capacity
   *  if the tab hasn't been created yet (no deposit made into it). */
  tab(tabId: string): Inventory {
    return this.tabs.get(tabId) ?? Inventory.empty(this.registry, this.capacityFor(tabId));
  }

  /** Ids of tabs that have actually been created — always includes the shared tab. */
  tabIds(): readonly string[] {
    return [...this.tabs.keys()];
  }

  private withTab(tabId: string, inv: Inventory): Bank {
    const next = new Map(this.tabs);
    next.set(tabId, inv);
    return new Bank(this.registry, this.sharedCapacity, this.tabCapacity, next);
  }

  /** Replaces a tab's whole inventory wholesale — the seam a UI's own
   *  in-grid mutations (built on `Inventory.move`/`split`/`merge` directly,
   *  same as `InventoryGrid`) reconcile back into the Bank through. */
  setTab(tabId: string, inv: Inventory): Bank {
    return this.withTab(tabId, inv);
  }

  deposit(tabId: string, itemId: string, count: number): Result<Bank, InventoryError> {
    const added = this.tab(tabId).add(itemId, count);
    if (!isOk(added)) return added;
    return ok(this.withTab(tabId, added.value));
  }

  withdraw(tabId: string, itemId: string, count: number): Result<Bank, InventoryError> {
    const removed = this.tab(tabId).remove(itemId, count);
    if (!isOk(removed)) return removed;
    return ok(this.withTab(tabId, removed.value));
  }

  move(tabId: string, from: number, to: number): Result<Bank, InventoryError> {
    const moved = this.tab(tabId).move(from, to);
    if (!isOk(moved)) return moved;
    return ok(this.withTab(tabId, moved.value));
  }

  /** Persistable snapshot: one slot array per created tab. */
  toTabRecord(): Readonly<Record<string, readonly Slot[]>> {
    const out: Record<string, readonly Slot[]> = {};
    for (const [tabId, inv] of this.tabs) out[tabId] = inv.slots;
    return out;
  }
}
