// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { ItemDefinition } from "../../domain/items/ItemDefinition";
import type { ActionBarSlot } from "../../domain/ui/ActionBarState";
import { createLocalizer } from "../i18n/strings";
import { ActionBar } from "./ActionBar";

const loc = createLocalizer("en");

const ITEMS: readonly ItemDefinition[] = [
  { id: "berry", displayName: "Berry", maxStackSize: 20, tags: ["food"], tier: 0, food: { hungerRestore: 4, healthRestore: 0 } },
];

function registry(): ItemRegistry {
  const r = ItemRegistry.create(ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

const ABILITY_SLOT: ActionBarSlot = {
  id: "sparkle-bolt",
  kind: "ability",
  displayName: "Sparkle Bolt",
  readyFraction: 1,
};

const CONSUMABLE_SLOT: ActionBarSlot = {
  id: "berry",
  kind: "consumable",
  displayName: "Berry",
  readyFraction: 1,
  count: 3,
  itemId: "berry",
};

describe("ActionBar", () => {
  it("is mounted but hidden by default (opt-in, OFF by default)", () => {
    const bar = ActionBar({ loc, registry: registry() });
    expect(bar.visible).toBe(false);
    expect((bar.el as HTMLElement).style.display).toBe("none");
    bar.dispose();
  });

  it("N toggles visibility", () => {
    const bar = ActionBar({ loc, registry: registry() });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyN" }));
    expect(bar.visible).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyN" }));
    expect(bar.visible).toBe(false);
    bar.dispose();
  });

  it("Escape closes it while open, but is a no-op while already closed", () => {
    const bar = ActionBar({ loc, registry: registry() });
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(bar.visible).toBe(false);
    bar.setVisible(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(bar.visible).toBe(false);
    bar.dispose();
  });

  it("the close button hides it", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.setVisible(true);
    bar.el.querySelector<HTMLButtonElement>(".lw-action-bar-header button")?.click();
    expect(bar.visible).toBe(false);
    bar.dispose();
  });

  it("renders one focusable slot button per slot", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.render([ABILITY_SLOT, CONSUMABLE_SLOT]);
    const slots = bar.el.querySelectorAll<HTMLButtonElement>(".lw-action-slot");
    expect(slots).toHaveLength(2);
    expect(slots[0]?.dataset.kind).toBe("ability");
    expect(slots[1]?.dataset.kind).toBe("consumable");
    bar.dispose();
  });

  it("renders the ability's name as a text label (no icon source yet)", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.render([ABILITY_SLOT]);
    expect(bar.el.querySelector(".lw-action-slot-name")?.textContent).toBe("Sparkle Bolt");
    bar.dispose();
  });

  it("renders a consumable's item icon + stack count instead of a text label", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.render([CONSUMABLE_SLOT]);
    expect(bar.el.querySelector(".lw-item-icon")).not.toBeNull();
    expect(bar.el.querySelector(".lw-action-slot-count")?.textContent).toBe("3");
    bar.dispose();
  });

  it("shows a cooldown curtain only when an ability isn't fully ready", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.render([{ ...ABILITY_SLOT, readyFraction: 0.25 }]);
    expect(bar.el.querySelector(".lw-action-slot-cooldown")).not.toBeNull();
    bar.render([ABILITY_SLOT]);
    expect(bar.el.querySelector(".lw-action-slot-cooldown")).toBeNull();
    bar.dispose();
  });

  it("clicking a slot calls onActivate with the slot and its index", () => {
    const onActivate = vi.fn();
    const bar = ActionBar({ loc, registry: registry(), onActivate });
    bar.render([ABILITY_SLOT, CONSUMABLE_SLOT]);
    bar.el.querySelectorAll<HTMLButtonElement>(".lw-action-slot")[1]?.click();
    expect(onActivate).toHaveBeenCalledWith(CONSUMABLE_SLOT, 1);
    bar.dispose();
  });

  it("Shift+2 activates slot index 1", () => {
    const onActivate = vi.fn();
    const bar = ActionBar({ loc, registry: registry(), onActivate });
    bar.render([ABILITY_SLOT, CONSUMABLE_SLOT]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", shiftKey: true }));
    expect(onActivate).toHaveBeenCalledWith(CONSUMABLE_SLOT, 1);
    bar.dispose();
  });

  it("bare digit keys (no Shift) do not activate a slot", () => {
    const onActivate = vi.fn();
    const bar = ActionBar({ loc, registry: registry(), onActivate });
    bar.render([ABILITY_SLOT]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    expect(onActivate).not.toHaveBeenCalled();
    bar.dispose();
  });

  it("re-rendering disposes the previous render's tooltips (no leaked listeners)", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.render([ABILITY_SLOT]);
    bar.render([]);
    expect(bar.el.querySelectorAll(".lw-action-slot")).toHaveLength(0);
    bar.dispose();
  });

  it("dispose removes its keydown listener", () => {
    const bar = ActionBar({ loc, registry: registry() });
    bar.dispose();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyN" }));
    expect(bar.visible).toBe(false);
  });
});
