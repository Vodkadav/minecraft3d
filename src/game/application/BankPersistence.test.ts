import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { Bank, SHARED_BANK_TAB } from "../domain/storage/Bank";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import type { AccountStore } from "./ports/AccountStore";
import type { StorageError } from "./ports/StorageError";
import { BankPersistence } from "./BankPersistence";

/** Honest fake — mirrors InMemoryKeyValueStore's contract exactly
 *  (test-honest-fakes-over-mocks). */
class FakeAccountStore implements AccountStore {
  private readonly entries = new Map<string, string>();

  put(key: string, value: string): Promise<Result<void, StorageError>> {
    this.entries.set(key, value);
    return Promise.resolve(ok(undefined));
  }

  get(key: string): Promise<Result<string, StorageError>> {
    const found = this.entries.get(key);
    if (found === undefined) return Promise.resolve(err({ kind: "NotFound", key }));
    return Promise.resolve(ok(found));
  }
}

const registry = (() => {
  const r = ItemRegistry.create([{ id: "gem", displayName: "Gem", maxStackSize: 99, tags: [], tier: 0 }]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

const OPTIONS = { sharedCapacity: 9, tabCapacity: 4 };

describe("BankPersistence", () => {
  it("reports NoBank when nothing has been saved yet", async () => {
    const persistence = new BankPersistence(new FakeAccountStore(), registry, OPTIONS);
    const loaded = await persistence.load();
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoBank");
  });

  it("round-trips a deposited bank through save/load", async () => {
    const persistence = new BankPersistence(new FakeAccountStore(), registry, OPTIONS);
    const deposited = Bank.empty(registry, OPTIONS).deposit(SHARED_BANK_TAB, "gem", 7);
    if (!isOk(deposited)) throw new Error("deposit failed");

    await persistence.save(deposited.value);
    const loaded = await persistence.load();
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) expect(loaded.value.tab(SHARED_BANK_TAB).count("gem")).toBe(7);
  });

  it("cross-world round-trip: deposit under one session, withdraw under a fresh one over the same account store", async () => {
    const store = new FakeAccountStore();

    // Session "world A": deposit and save.
    const sessionA = new BankPersistence(store, registry, OPTIONS);
    const deposited = Bank.empty(registry, OPTIONS).deposit(SHARED_BANK_TAB, "gem", 10);
    if (!isOk(deposited)) throw new Error("deposit failed");
    await sessionA.save(deposited.value);

    // Session "world B": a brand-new BankPersistence over the SAME account
    // store (simulating a different world/character load) sees the deposit
    // and can withdraw it.
    const sessionB = new BankPersistence(store, registry, OPTIONS);
    const loadedB = await sessionB.load();
    expect(isOk(loadedB)).toBe(true);
    if (!isOk(loadedB)) return;
    expect(loadedB.value.tab(SHARED_BANK_TAB).count("gem")).toBe(10);

    const withdrawn = loadedB.value.withdraw(SHARED_BANK_TAB, "gem", 10);
    if (!isOk(withdrawn)) throw new Error("withdraw failed");
    await sessionB.save(withdrawn.value);

    const loadedAgain = await sessionA.load();
    expect(isOk(loadedAgain)).toBe(true);
    if (isOk(loadedAgain)) expect(loadedAgain.value.tab(SHARED_BANK_TAB).count("gem")).toBe(0);
  });

  it("keeps private character tabs separate across the round-trip", async () => {
    const store = new FakeAccountStore();
    const persistence = new BankPersistence(store, registry, OPTIONS);

    const a = Bank.empty(registry, OPTIONS).deposit("char-a", "gem", 2);
    if (!isOk(a)) throw new Error("deposit failed");
    const b = a.value.deposit("char-b", "gem", 5);
    if (!isOk(b)) throw new Error("deposit failed");
    await persistence.save(b.value);

    const loaded = await persistence.load();
    expect(isOk(loaded)).toBe(true);
    if (!isOk(loaded)) return;
    expect(loaded.value.tab("char-a").count("gem")).toBe(2);
    expect(loaded.value.tab("char-b").count("gem")).toBe(5);
  });

  it("reports CorruptBank for a malformed stored blob", async () => {
    const store = new FakeAccountStore();
    await store.put("bank", "not json");
    const persistence = new BankPersistence(store, registry, OPTIONS);

    const loaded = await persistence.load();
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptBank");
  });
});
