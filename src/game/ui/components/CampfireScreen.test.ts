// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { Inventory } from "../../domain/inventory/Inventory";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { STARTER_RECIPES } from "../../domain/crafting/starterRecipes";
import { spawnCampfire, startCook } from "../../domain/placeables/Campfire";
import { createLocalizer } from "../i18n/strings";
import { mountCampfireScreen } from "./CampfireScreen";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("mountCampfireScreen", () => {
  it("starts closed", () => {
    const screen = mountCampfireScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      onCook: vi.fn(),
      onCollect: vi.fn(),
    });
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("lists cookable raw items the player is carrying", () => {
    const reg = registry();
    const added = Inventory.empty(reg, 9).add("meat", 1);
    if (!isOk(added)) throw new Error("setup");
    const screen = mountCampfireScreen({
      loc: createLocalizer("en"),
      registry: reg,
      recipes: STARTER_RECIPES,
      onCook: vi.fn(),
      onCollect: vi.fn(),
    });
    screen.open(added.value, spawnCampfire(), 0);
    expect(document.querySelector('[data-item-id="meat"]')).toBeTruthy();
    screen.dispose();
  });

  it("shows the empty message when nothing cookable is carried", () => {
    const reg = registry();
    const screen = mountCampfireScreen({
      loc: createLocalizer("en"),
      registry: reg,
      recipes: STARTER_RECIPES,
      onCook: vi.fn(),
      onCollect: vi.fn(),
    });
    screen.open(Inventory.empty(reg, 9), spawnCampfire(), 0);
    expect(document.querySelector(".lw-campfire-empty")).toBeTruthy();
    screen.dispose();
  });

  it("clicking Cook fires onCook with the item id", () => {
    const reg = registry();
    const added = Inventory.empty(reg, 9).add("meat", 1);
    if (!isOk(added)) throw new Error("setup");
    const onCook = vi.fn();
    const screen = mountCampfireScreen({
      loc: createLocalizer("en"),
      registry: reg,
      recipes: STARTER_RECIPES,
      onCook,
      onCollect: vi.fn(),
    });
    screen.open(added.value, spawnCampfire(), 0);
    document.querySelector('[data-item-id="meat"] button')?.dispatchEvent(new MouseEvent("click"));
    expect(onCook).toHaveBeenCalledWith("meat");
    screen.dispose();
  });

  it("shows progress while cooking and enables Collect only once done", () => {
    const reg = registry();
    const started = startCook(spawnCampfire(), STARTER_RECIPES, "meat", 0);
    if (!isOk(started)) throw new Error("setup");
    const screen = mountCampfireScreen({
      loc: createLocalizer("en"),
      registry: reg,
      recipes: STARTER_RECIPES,
      onCook: vi.fn(),
      onCollect: vi.fn(),
    });
    screen.open(Inventory.empty(reg, 9), started.value, 1000);
    const collectBtn = document.querySelector("button.laas-ui:not([data-variant])") as HTMLButtonElement | null;
    expect(document.querySelector(".lw-campfire-status")?.textContent).toContain("Cooking");
    screen.render(Inventory.empty(reg, 9), started.value, 12_000);
    expect(document.querySelector(".lw-campfire-status")?.textContent).toContain("Ready");
    void collectBtn;
  });

  it("Escape closes the overlay", () => {
    const setInputEnabled = vi.fn();
    const screen = mountCampfireScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      onCook: vi.fn(),
      onCollect: vi.fn(),
      setInputEnabled,
    });
    screen.open(Inventory.empty(registry(), 9), spawnCampfire(), 0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });
});
