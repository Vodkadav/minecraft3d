// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../domain/Result";
import { Inventory } from "../domain/inventory/Inventory";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../domain/items/starterItems";
import { Bank, SHARED_BANK_TAB } from "../domain/storage/Bank";
import { createLocalizer } from "./i18n/strings";
import { mountBankScreen } from "./BankScreen";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

const OPTIONS = { sharedCapacity: 20, tabCapacity: 12 };

describe("mountBankScreen", () => {
  it("starts closed", () => {
    const screen = mountBankScreen({ loc: createLocalizer("en"), registry: registry(), characterId: "p1" });
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("opens against a player inventory + bank, releasing pointer lock and pausing input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const reg = registry();
    const screen = mountBankScreen({
      loc: createLocalizer("en"),
      registry: reg,
      characterId: "p1",
      setInputEnabled,
    });

    screen.open(Inventory.empty(reg, 9), Bank.empty(reg, OPTIONS));

    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    expect(document.querySelectorAll(".lw-inv-grid").length).toBe(2);
    screen.dispose();
  });

  it("K toggles open/closed and Escape closes, restoring input", () => {
    const setInputEnabled = vi.fn();
    const reg = registry();
    const screen = mountBankScreen({
      loc: createLocalizer("en"),
      registry: reg,
      characterId: "p1",
      setInputEnabled,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(screen.isOpen).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });

  it("dragging a stack from the player grid onto the shared bank tab deposits it", () => {
    const reg = registry();
    const screen = mountBankScreen({ loc: createLocalizer("en"), registry: reg, characterId: "p1" });
    let seededPlayer = Inventory.empty(reg, 9);
    const added = seededPlayer.add("wood", 5);
    if (!isOk(added)) throw new Error("setup");
    seededPlayer = added.value;

    screen.open(seededPlayer, Bank.empty(reg, OPTIONS));

    const grids = document.querySelectorAll(".lw-inv-grid");
    const playerGridEl = grids[0] as HTMLElement;
    const bankGridEl = grids[1] as HTMLElement;
    const playerSlot = playerGridEl.querySelector('[role="gridcell"]') as HTMLElement;
    const bankSlot = bankGridEl.querySelector('[role="gridcell"]') as HTMLElement;

    playerSlot.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), {
        dataTransfer: { setData: vi.fn(), getData: vi.fn() },
      }),
    );
    bankSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(screen.bank.tab(SHARED_BANK_TAB).count("wood")).toBe(5);
    screen.dispose();
  });

  it("keeps the character tab isolated from the shared tab when switching", () => {
    const reg = registry();
    const screen = mountBankScreen({ loc: createLocalizer("en"), registry: reg, characterId: "char-a" });
    const withGem = Bank.empty(reg, OPTIONS).deposit(SHARED_BANK_TAB, "wood", 3);
    if (!isOk(withGem)) throw new Error("setup");
    const withChar = withGem.value.deposit("char-a", "stone", 2);
    if (!isOk(withChar)) throw new Error("setup");

    screen.open(Inventory.empty(reg, 9), withChar.value);

    const characterTabBtn = document.querySelectorAll<HTMLButtonElement>(".lw-inv-tabs button")[1];
    characterTabBtn.click();

    const bankGridEl = document.querySelectorAll(".lw-inv-grid")[1] as HTMLElement;
    expect(bankGridEl.textContent).toContain("Stone");
    expect(bankGridEl.textContent).not.toContain("Wood");
    screen.dispose();
  });
});
