// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../domain/Result";
import { Inventory } from "../domain/inventory/Inventory";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../domain/items/starterItems";
import { STARTER_RECIPES } from "../domain/crafting/starterRecipes";
import { ACHIEVEMENTS } from "../domain/progression/Achievements";
import { createLocalizer } from "./i18n/strings";
import { mountInventoryScreen } from "./InventoryScreen";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("mountInventoryScreen", () => {
  it("starts closed", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    expect(screen.isOpen).toBe(false);
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(true);
    screen.dispose();
  });

  it("pressing I opens the overlay, releases pointer lock, and pauses input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      setInputEnabled,
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true }));
    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    screen.dispose();
  });

  it("pressing I again closes it and restores input", () => {
    const setInputEnabled = vi.fn();
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      setInputEnabled,
    });
    screen.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "I", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    screen.dispose();
  });

  it("Escape closes the overlay", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.open();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("does not toggle on 'i' typed into a focused text input (e.g. crafting search)", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.open();
    const search = document.createElement("input");
    search.type = "text";
    document.body.appendChild(search);
    search.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true }));
    expect(screen.isOpen).toBe(true); // stayed open, not toggled closed
    search.remove();
    screen.dispose();
  });

  it("switches between the inventory and crafting tabs", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.open();
    expect(document.querySelector(".lw-inv-grid")).toBeTruthy();
    const craftingTab = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Crafting",
    );
    craftingTab?.click();
    expect(document.querySelector(".lw-crafting")).toBeTruthy();
    expect(document.querySelector(".lw-inv-grid")).toBeFalsy();
    screen.dispose();
  });

  it("crafting inside the overlay updates the inventory grid via the shared inventory", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    const seeded = registry();
    // seed inventory directly through setInventory (mirrors GameHud's real flow)
    const inv = Inventory.empty(seeded, 27).add("wood", 2);
    if (!isOk(inv)) throw new Error("setup");
    screen.setInventory(inv.value);
    screen.open();

    const craftingTab = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Crafting",
    );
    craftingTab?.click();
    const planksRow = document.querySelector('[data-recipe-id="planks"]');
    const craftBtn = planksRow?.querySelector("button");
    craftBtn?.click();

    expect(screen.inventory.count("plank")).toBe(4);
    screen.dispose();
  });

  it("hides the achievements tab when no achievements are provided", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.open();
    const tab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Achievements");
    expect(tab).toBeUndefined();
    screen.dispose();
  });

  it("shows and switches to the achievements tab when provided", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      achievements: ACHIEVEMENTS,
    });
    screen.open();
    const tab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Achievements");
    expect(tab).toBeTruthy();
    tab?.click();
    expect(document.querySelector(".lw-achievements-grid")).toBeTruthy();
    screen.dispose();
  });

  it("setUnlockedTier and setUnlockedAchievements delegate to the child screens", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 0,
      achievements: ACHIEVEMENTS,
    });
    screen.open();
    const craftingTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Crafting");
    craftingTab?.click();
    expect(document.querySelector('[data-recipe-id="ingot"]')?.getAttribute("data-locked")).toBe("true");
    screen.setUnlockedTier(1);
    expect(document.querySelector('[data-recipe-id="ingot"]')?.getAttribute("data-locked")).toBe("false");

    const achievementsTab = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Achievements",
    );
    achievementsTab?.click();
    screen.setUnlockedAchievements(["first-dig"]);
    expect(document.querySelector('[data-achievement-id="first-dig"]')?.getAttribute("data-unlocked")).toBe(
      "true",
    );
    screen.dispose();
  });

  it("fires onCraft when crafting inside the overlay", () => {
    const onCraft = vi.fn();
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      onCraft,
    });
    const seeded = registry();
    const inv = Inventory.empty(seeded, 27).add("wood", 2);
    if (!isOk(inv)) throw new Error("setup");
    screen.setInventory(inv.value);
    screen.open();
    const craftingTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Crafting");
    craftingTab?.click();
    document.querySelector('[data-recipe-id="planks"] button')?.dispatchEvent(new MouseEvent("click"));
    expect(onCraft).toHaveBeenCalledTimes(1);
    screen.dispose();
  });

  it("the Sort button autosorts and merges the inventory grid", () => {
    const onInventoryChange = vi.fn();
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      onInventoryChange,
    });
    const reg = registry();
    const inv = Inventory.empty(reg, 27).add("wood", 5);
    if (!isOk(inv)) throw new Error("setup");
    const inv2 = inv.value.add("wood", 3);
    if (!isOk(inv2)) throw new Error("setup");
    screen.setInventory(inv2.value); // two partial wood stacks
    screen.open();

    const sortButton = [...document.querySelectorAll("button")].find((b) => b.textContent === "Sort");
    sortButton?.click();

    expect(screen.inventory.count("wood")).toBe(8);
    const woodSlots = screen.inventory.slots.filter((s) => s?.itemId === "wood");
    expect(woodSlots).toHaveLength(1); // merged into one stack
    expect(onInventoryChange).toHaveBeenCalled();
    screen.dispose();
  });

  it("switches to the filter tab and adding a rule highlights matching slots", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    const reg = registry();
    const inv = Inventory.empty(reg, 27).add("meat", 1);
    if (!isOk(inv)) throw new Error("setup");
    screen.setInventory(inv.value);
    screen.open();

    const filterTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Filter");
    filterTab?.click();
    expect(document.querySelector(".lw-filter-editor")).toBeTruthy();

    const tagSelect = document.querySelector<HTMLSelectElement>("#lw-filter-add-tag")!;
    tagSelect.value = "food";
    document.querySelector<HTMLButtonElement>(".lw-filter-add button[type='submit']")?.click();

    const inventoryTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Inventory");
    inventoryTab?.click();
    const meatCell = [...document.querySelectorAll<HTMLElement>(".lw-inv-slot")].find((c) =>
      c.textContent?.includes("Meat"),
    );
    expect(meatCell?.dataset.filterAction).toBe("highlight");
    screen.dispose();
  });

  it("fires onFilterRulesChange when a rule is added", () => {
    const onFilterRulesChange = vi.fn();
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      filterRules: [],
      onFilterRulesChange,
    });
    screen.open();
    const filterTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Filter");
    filterTab?.click();
    document.querySelector<HTMLButtonElement>(".lw-filter-add button[type='submit']")?.click();
    expect(onFilterRulesChange).toHaveBeenCalledTimes(1);
    screen.dispose();
  });

  it("dispose removes the overlay from the document", () => {
    const screen = mountInventoryScreen({
      loc: createLocalizer("en"),
      registry: registry(),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.dispose();
    expect(document.querySelector(".lw-inv-overlay")).toBeNull();
  });
});
