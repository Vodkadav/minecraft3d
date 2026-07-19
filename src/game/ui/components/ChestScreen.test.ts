// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { Inventory } from "../../domain/inventory/Inventory";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { createLocalizer } from "../i18n/strings";
import { mountChestScreen } from "./ChestScreen";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("mountChestScreen", () => {
  it("starts closed", () => {
    const screen = mountChestScreen({ loc: createLocalizer("en"), registry: registry() });
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("opens against a player + chest inventory pair, releasing pointer lock and pausing input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const reg = registry();
    const screen = mountChestScreen({ loc: createLocalizer("en"), registry: reg, setInputEnabled });

    const player = Inventory.empty(reg, 9);
    const chest = Inventory.empty(reg, 20);
    screen.open(player, chest, () => {});

    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    expect(document.querySelectorAll(".lw-inv-grid").length).toBe(2);
    screen.dispose();
  });

  it("Escape closes and restores input", () => {
    const setInputEnabled = vi.fn();
    const reg = registry();
    const screen = mountChestScreen({ loc: createLocalizer("en"), registry: reg, setInputEnabled });
    screen.open(Inventory.empty(reg, 9), Inventory.empty(reg, 20), () => {});
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });

  it("dragging a stack from the player grid onto the chest grid deposits it", () => {
    const reg = registry();
    const screen = mountChestScreen({ loc: createLocalizer("en"), registry: reg });
    let seededPlayer = Inventory.empty(reg, 9);
    const added = seededPlayer.add("wood", 5);
    if (!isOk(added)) throw new Error("setup");
    seededPlayer = added.value;
    const chest = Inventory.empty(reg, 20);

    let latestPlayer = seededPlayer;
    let latestChest = chest;
    screen.open(seededPlayer, chest, (p, c) => {
      latestPlayer = p;
      latestChest = c;
    });

    const grids = document.querySelectorAll(".lw-inv-grid");
    const playerGridEl = grids[0] as HTMLElement;
    const chestGridEl = grids[1] as HTMLElement;
    const playerSlot = playerGridEl.querySelector('[role="gridcell"]') as HTMLElement;
    const chestSlot = chestGridEl.querySelector('[role="gridcell"]') as HTMLElement;

    playerSlot.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), {
        dataTransfer: { setData: vi.fn(), getData: vi.fn() },
      }),
    );
    chestSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(latestChest.count("wood")).toBe(5);
    expect(latestPlayer.count("wood")).toBe(0);
    screen.dispose();
  });
});
