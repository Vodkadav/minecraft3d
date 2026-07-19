/**
 * Use case: round-trip the account bank through the {@link AccountStore} port.
 * Unlike `CharacterPersistence`/`ProgressionPersistence` (which key off
 * `WorldId`), the bank is account-scoped — one record, reachable identically
 * from any world/character session, which is exactly what makes a deposit in
 * world A visible on withdraw in world B.
 *
 * The untyped stored blob is a trust boundary (err-explicit-result-handling):
 * `NoBank` (nothing saved yet) is the routine "first ever open" branch a
 * caller falls back to `Bank.empty()` for; `CorruptBank` is an unexpected
 * shape and surfaced, never silently discarded.
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import { Bank, type BankOptions } from "../domain/storage/Bank";
import type { Slot } from "../domain/inventory/Inventory";
import type { ItemRegistry } from "../domain/items/ItemRegistry";
import type { AccountStore } from "./ports/AccountStore";
import type { StorageError } from "./ports/StorageError";

const BANK_KEY = "bank";

export type BankLoadError =
  | StorageError
  | { readonly kind: "NoBank" }
  | { readonly kind: "CorruptBank"; readonly detail: string };

function isSlot(s: unknown): s is Slot {
  if (s === null) return true;
  if (typeof s !== "object") return false;
  const rec = s as Record<string, unknown>;
  return typeof rec.itemId === "string" && typeof rec.count === "number";
}

function isSlotArray(v: unknown): v is Slot[] {
  return Array.isArray(v) && v.every(isSlot);
}

function parseTabRecord(raw: string): Result<Readonly<Record<string, readonly Slot[]>>, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return err(e instanceof Error ? e.message : "invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) return err("not a tab record");
  const record = parsed as Record<string, unknown>;
  const out: Record<string, readonly Slot[]> = {};
  for (const [tabId, slots] of Object.entries(record)) {
    if (!isSlotArray(slots)) return err(`bad slot array for tab ${tabId}`);
    out[tabId] = slots;
  }
  return ok(out);
}

export class BankPersistence {
  constructor(
    private readonly store: AccountStore,
    private readonly registry: ItemRegistry,
    private readonly options: BankOptions,
  ) {}

  async save(bank: Bank): Promise<Result<void, StorageError>> {
    return this.store.put(BANK_KEY, JSON.stringify(bank.toTabRecord()));
  }

  async load(): Promise<Result<Bank, BankLoadError>> {
    const raw = await this.store.get(BANK_KEY);
    if (!isOk(raw)) {
      if (raw.error.kind === "NotFound") return err({ kind: "NoBank" });
      return raw;
    }
    const parsed = parseTabRecord(raw.value);
    if (!isOk(parsed)) return err({ kind: "CorruptBank", detail: parsed.error });

    const bank = Bank.fromTabs(this.registry, this.options, parsed.value);
    if (!isOk(bank)) return err({ kind: "CorruptBank", detail: bank.error.kind });
    return ok(bank.value);
  }
}
