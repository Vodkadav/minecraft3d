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

  it("the player-side Sort button autosorts+merges the player inventory only", () => {
    const reg = registry();
    const screen = mountChestScreen({ loc: createLocalizer("en"), registry: reg });
    let player = Inventory.empty(reg, 9);
    const a = player.add("wood", 5);
    if (!isOk(a)) throw new Error("setup");
    const b = a.value.add("wood", 3);
    if (!isOk(b)) throw new Error("setup");
    player = b.value;
    const chest = Inventory.empty(reg, 20);

    let latestPlayer = player;
    let latestChest = chest;
    screen.open(player, chest, (p, c) => {
      latestPlayer = p;
      latestChest = c;
    });

    const sortButtons = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Sort");
    expect(sortButtons).toHaveLength(2);
    sortButtons[0]?.click(); // player-side sort

    expect(latestPlayer.count("wood")).toBe(8);
    expect(latestPlayer.slots.filter((s) => s?.itemId === "wood")).toHaveLength(1);
    expect(latestChest.totalCount()).toBe(0); // chest untouched
    screen.dispose();
  });

  it("applies the given filterRules as data-filter-action on both grids", () => {
    const reg = registry();
    const screen = mountChestScreen({
      loc: createLocalizer("en"),
      registry: reg,
      filterRules: [{ id: "r1", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" }],
    });
    let player = Inventory.empty(reg, 9);
    const a = player.add("meat", 1);
    if (!isOk(a)) throw new Error("setup");
    player = a.value;
    let chest = Inventory.empty(reg, 20);
    const c = chest.add("meat", 1);
    if (!isOk(c)) throw new Error("setup");
    chest = c.value;

    screen.open(player, chest, () => {});
    const cells = [...document.querySelectorAll<HTMLElement>(".lw-inv-slot")].filter((el) =>
      el.textContent?.includes("Meat"),
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.dataset.filterAction === "highlight")).toBe(true);
    screen.dispose();
  });

  it("setFilterRules live-updates both grids", () => {
    const reg = registry();
    const screen = mountChestScreen({ loc: createLocalizer("en"), registry: reg });
    let player = Inventory.empty(reg, 9);
    const a = player.add("meat", 1);
    if (!isOk(a)) throw new Error("setup");
    player = a.value;
    screen.open(player, Inventory.empty(reg, 20), () => {});

    const meatCell = [...document.querySelectorAll<HTMLElement>(".lw-inv-slot")].find((el) =>
      el.textContent?.includes("Meat"),
    );
    expect(meatCell?.dataset.filterAction).toBeUndefined();

    screen.setFilterRules([{ id: "r1", enabled: true, match: { kind: "tag", tag: "food" }, action: "dim" }]);
    expect(meatCell?.dataset.filterAction).toBe("dim");
    screen.dispose();
  });
});
