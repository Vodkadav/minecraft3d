// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { Inventory } from "../../domain/inventory/Inventory";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { createLocalizer } from "../i18n/strings";
import { InventoryGrid } from "./InventoryGrid";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

function invWith(reg: ItemRegistry, entries: Array<[number, string, number]>, capacity = 27): Inventory {
  const slots = Array.from({ length: capacity }, () => null as null | { itemId: string; count: number });
  for (const [i, id, n] of entries) slots[i] = { itemId: id, count: n };
  const r = Inventory.fromSlots(reg, slots);
  if (!isOk(r)) throw new Error("bad inventory setup");
  return r.value;
}

describe("InventoryGrid", () => {
  it("renders one gridcell per slot with item names and counts", () => {
    const reg = registry();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory" });
    grid.render(invWith(reg, [[0, "wood", 5]]));
    const cells = grid.el.querySelectorAll('[role="gridcell"]');
    expect(cells).toHaveLength(27);
    expect(cells[0]?.textContent).toContain("Wood");
    expect(cells[0]?.textContent).toContain("5");
  });

  it("empty slots get an empty aria-label, no crash", () => {
    const reg = registry();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory" });
    grid.render(Inventory.empty(reg, 27));
    const first = grid.el.querySelector('[role="gridcell"]');
    expect(first?.getAttribute("aria-label")).toContain("empty");
  });

  it("click-click moves a stack into an empty slot", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.click();
    expect(cells[0]?.dataset.picked).toBe("true");
    cells[3]?.click();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[0]).toBeNull();
    expect(next.slots[3]).toEqual({ itemId: "wood", count: 5 });
  });

  it("click-click on the same slot twice cancels the pick", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.click();
    cells[0]?.click();
    expect(onChange).not.toHaveBeenCalled();
    expect(cells[0]?.dataset.picked).toBe("false");
  });

  it("click-click merges same-item stacks", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5], [1, "wood", 3]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.click();
    cells[1]?.click();
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[1]).toEqual({ itemId: "wood", count: 8 });
    expect(next.slots[0]).toBeNull();
  });

  it("click-click swaps two different items", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5], [1, "stone", 2]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.click();
    cells[1]?.click();
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[0]).toEqual({ itemId: "stone", count: 2 });
    expect(next.slots[1]).toEqual({ itemId: "wood", count: 5 });
  });

  it("right-click splits a stack in half", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 10]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[0]?.count).toBe(5);
    const otherSlot = next.slots.find((s, i) => i !== 0 && s?.itemId === "wood");
    expect(otherSlot?.count).toBe(5);
  });

  it("right-click on a single-count stack does nothing", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 1]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("double-click quick-moves between hotbar and backpack zones", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({
      registry: reg,
      loc: createLocalizer("en"),
      ariaLabel: "Inventory",
      hotbarSize: 9,
      onChange,
    });
    grid.render(invWith(reg, [[10, "wood", 5]])); // backpack zone
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[10]?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[10]).toBeNull();
    const inHotbar = next.slots.slice(0, 9).some((s) => s?.itemId === "wood");
    expect(inHotbar).toBe(true);
  });

  it("keyboard: arrow keys move the roving cursor and Enter picks/places", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    expect(cells[0]?.tabIndex).toBe(0);

    cells[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(cells[0]?.dataset.picked).toBe("true");

    cells[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    // cursor moved to slot 1, which now has tabIndex 0
    expect(cells[1]?.tabIndex).toBe(0);

    cells[1]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[1]).toEqual({ itemId: "wood", count: 5 });
    expect(next.slots[0]).toBeNull();
  });

  it("Escape cancels a pending keyboard pick", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    cells[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(cells[0]?.dataset.picked).toBe("true");
    cells[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(cells[0]?.dataset.picked).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drag and drop within the same grid moves the stack (cross-grid via onExternalDrop)", () => {
    const reg = registry();
    const onChange = vi.fn();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory", onChange });
    grid.render(invWith(reg, [[0, "wood", 5]]));
    const cells = grid.el.querySelectorAll<HTMLElement>('[role="gridcell"]');

    const dt = { setData: vi.fn(), getData: vi.fn() };
    cells[0]?.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), { dataTransfer: dt }),
    );
    cells[4]?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.slots[4]).toEqual({ itemId: "wood", count: 5 });
    expect(next.slots[0]).toBeNull();
  });

  it("cross-grid drop calls onExternalDrop instead of mutating locally", () => {
    const reg = registry();
    const chestChange = vi.fn();
    const onExternalDrop = vi.fn();
    const chest = InventoryGrid({
      registry: reg,
      loc: createLocalizer("en"),
      ariaLabel: "Chest",
      gridId: "chest-1",
      onChange: chestChange,
      onExternalDrop,
    });
    chest.render(Inventory.empty(reg, 12));

    const player = InventoryGrid({
      registry: reg,
      loc: createLocalizer("en"),
      ariaLabel: "Player",
      gridId: "player-1",
    });
    player.render(invWith(reg, [[0, "wood", 5]]));

    const playerCells = player.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    const chestCells = chest.el.querySelectorAll<HTMLElement>('[role="gridcell"]');
    playerCells[0]?.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), {
        dataTransfer: { setData: vi.fn(), getData: vi.fn() },
      }),
    );
    chestCells[2]?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(onExternalDrop).toHaveBeenCalledWith("player-1", 0, 2);
    expect(chestChange).not.toHaveBeenCalled();
  });

  it("dispose removes the mounted grid", () => {
    const reg = registry();
    const grid = InventoryGrid({ registry: reg, loc: createLocalizer("en"), ariaLabel: "Inventory" });
    document.body.appendChild(grid.el);
    grid.render(Inventory.empty(reg, 27));
    grid.dispose();
    expect(document.body.contains(grid.el)).toBe(false);
  });
});
