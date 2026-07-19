import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { Bank, SHARED_BANK_TAB } from "./Bank";

const registry = (() => {
  const r = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 },
    { id: "gem", displayName: "Gem", maxStackSize: 99, tags: [], tier: 0 },
  ]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

const OPTIONS = { sharedCapacity: 9, tabCapacity: 4 };

function bank(): Bank {
  return Bank.empty(registry, OPTIONS);
}

describe("Bank", () => {
  it("starts with an empty shared tab and no private tabs", () => {
    const b = bank();
    expect(b.tabIds()).toEqual([SHARED_BANK_TAB]);
    expect(b.tab(SHARED_BANK_TAB).capacity).toBe(9);
    expect(b.tab(SHARED_BANK_TAB).totalCount()).toBe(0);
  });

  it("deposits into the shared tab", () => {
    const r = bank().deposit(SHARED_BANK_TAB, "wood", 10);
    if (!isOk(r)) throw new Error("deposit failed");
    expect(r.value.tab(SHARED_BANK_TAB).count("wood")).toBe(10);
  });

  it("withdraws from the shared tab", () => {
    const deposited = bank().deposit(SHARED_BANK_TAB, "wood", 10);
    if (!isOk(deposited)) throw new Error("deposit failed");
    const withdrawn = deposited.value.withdraw(SHARED_BANK_TAB, "wood", 4);
    if (!isOk(withdrawn)) throw new Error("withdraw failed");
    expect(withdrawn.value.tab(SHARED_BANK_TAB).count("wood")).toBe(6);
  });

  it("rejects withdrawing more than is banked", () => {
    const deposited = bank().deposit(SHARED_BANK_TAB, "wood", 2);
    if (!isOk(deposited)) throw new Error("deposit failed");
    const withdrawn = deposited.value.withdraw(SHARED_BANK_TAB, "wood", 5);
    expect(isErr(withdrawn)).toBe(true);
  });

  it("creates a private character tab lazily on first deposit, at tabCapacity", () => {
    const r = bank().deposit("char-a", "gem", 3);
    if (!isOk(r)) throw new Error("deposit failed");
    expect([...r.value.tabIds()].sort()).toEqual(["char-a", SHARED_BANK_TAB]);
    expect(r.value.tab("char-a").capacity).toBe(4);
    expect(r.value.tab("char-a").count("gem")).toBe(3);
  });

  it("isolates private tabs from each other and from the shared tab", () => {
    const a = bank().deposit("char-a", "gem", 3);
    if (!isOk(a)) throw new Error("deposit failed");
    const b = a.value.deposit("char-b", "gem", 1);
    if (!isOk(b)) throw new Error("deposit failed");
    const shared = b.value.deposit(SHARED_BANK_TAB, "wood", 5);
    if (!isOk(shared)) throw new Error("deposit failed");

    expect(shared.value.tab("char-a").count("gem")).toBe(3);
    expect(shared.value.tab("char-b").count("gem")).toBe(1);
    expect(shared.value.tab(SHARED_BANK_TAB).count("gem")).toBe(0);
    expect(shared.value.tab(SHARED_BANK_TAB).count("wood")).toBe(5);
    // withdrawing from one tab never touches another
    const withdrawnA = shared.value.withdraw("char-a", "gem", 3);
    if (!isOk(withdrawnA)) throw new Error("withdraw failed");
    expect(withdrawnA.value.tab("char-b").count("gem")).toBe(1);
  });

  it("moves slots within a tab", () => {
    const deposited = bank().deposit(SHARED_BANK_TAB, "wood", 5);
    if (!isOk(deposited)) throw new Error("deposit failed");
    const moved = deposited.value.move(SHARED_BANK_TAB, 0, 3);
    if (!isOk(moved)) throw new Error("move failed");
    expect(moved.value.tab(SHARED_BANK_TAB).slots[3]).toEqual({ itemId: "wood", count: 5 });
    expect(moved.value.tab(SHARED_BANK_TAB).slots[0]).toBe(null);
  });

  it("round-trips through toTabRecord/fromTabs, preserving all tabs", () => {
    const populated = bank().deposit(SHARED_BANK_TAB, "wood", 5);
    if (!isOk(populated)) throw new Error("deposit failed");
    const withChar = populated.value.deposit("char-a", "gem", 2);
    if (!isOk(withChar)) throw new Error("deposit failed");

    const record = withChar.value.toTabRecord();
    const restored = Bank.fromTabs(registry, OPTIONS, record);
    if (!isOk(restored)) throw new Error("restore failed");

    expect(restored.value.tab(SHARED_BANK_TAB).count("wood")).toBe(5);
    expect(restored.value.tab("char-a").count("gem")).toBe(2);
  });
});
