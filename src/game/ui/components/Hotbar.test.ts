// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { Inventory } from "../../domain/inventory/Inventory";
import { Hotbar } from "./Hotbar";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

function inv(reg: ItemRegistry): Inventory {
  const empty = Inventory.empty(reg, 27);
  const withWood = empty.add("wood", 5);
  if (!isOk(withWood)) throw new Error("add failed");
  return withWood.value;
}

describe("Hotbar", () => {
  it("renders 9 focusable slots", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
    });
    expect(hotbar.el.querySelectorAll(".lw-hotbar-slot")).toHaveLength(9);
  });

  it("renders item display names and counts from the inventory model", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
    });
    hotbar.render(inv(reg));
    const first = hotbar.el.querySelector(".lw-hotbar-slot");
    expect(first?.textContent).toContain("Wood");
    expect(first?.textContent).toContain("5");
  });

  it("slot 0 is selected by default", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
    });
    const slots = hotbar.el.querySelectorAll<HTMLElement>(".lw-hotbar-slot");
    expect(slots[0]?.dataset.selected).toBe("true");
    expect(hotbar.selected).toBe(0);
  });

  it("clicking a slot selects it and calls onSelect", () => {
    const reg = registry();
    const target = new EventTarget();
    const onSelect = vi.fn();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
      onSelect,
    });
    const slots = hotbar.el.querySelectorAll<HTMLElement>(".lw-hotbar-slot");
    slots[3]?.click();
    expect(hotbar.selected).toBe(3);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("number key 5 selects slot index 4", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
    });
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
    expect(hotbar.selected).toBe(4);
  });

  it("wheel scroll wraps around", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
    });
    target.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }));
    expect(hotbar.selected).toBe(8);
  });

  it("enableDigitKeys: false leaves number keys to the host page", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
      enableDigitKeys: false,
    });
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
    expect(hotbar.selected).toBe(0);
    // wheel selection still works
    target.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));
    expect(hotbar.selected).toBe(1);
  });

  it("dispose removes its listeners", () => {
    const reg = registry();
    const target = new EventTarget();
    const hotbar = Hotbar({
      registry: reg,
      ariaLabel: "Hotbar",
      slotAriaLabel: (i) => `Slot ${i + 1}`,
      emptySlotLabel: "Empty",
      target,
    });
    hotbar.dispose();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "3" }));
    expect(hotbar.selected).toBe(0);
  });
});
