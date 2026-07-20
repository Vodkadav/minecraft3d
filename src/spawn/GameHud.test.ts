// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../game/domain/Result";
import { newCharacter } from "../game/domain/character/Character";
import { XP_PER_EVENT, xpForLevel } from "../game/domain/character/Leveling";
import { Inventory } from "../game/domain/inventory/Inventory";
import { ItemRegistry } from "../game/domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../game/domain/items/starterItems";
import { markKeyhintShown } from "../game/domain/progression/Keyhints";
import { emptyProgression, recordProgressionEvent } from "../game/domain/progression/ProgressionState";
import { TUTORIAL_OBJECTIVES } from "../game/domain/progression/Objectives";
import { ACHIEVEMENTS } from "../game/domain/progression/Achievements";
import { defaultFilterRules } from "../game/domain/inventory/ItemFilter";
import { InMemoryItemFilterStore } from "../game/infrastructure/persistence/InMemoryItemFilterStore";
import { createLocalizer } from "../game/ui/i18n/strings";
import { mountGameHud } from "./GameHud";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

describe("mountGameHud", () => {
  it("mounts an empty hotbar, toast host, and crosshair", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    expect(document.querySelector(".lw-hotbar")).toBeTruthy();
    expect(document.querySelector(".lw-toast-region")).toBeTruthy();
    expect(document.querySelector(".lw-crosshair")).toBeTruthy();
    hud.dispose();
  });

  it("addLoot adds to the inventory, renders it in the hotbar, and toasts it", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "wood", count: 3 }]);
    expect(hud.inventory.count("wood")).toBe(3);
    const first = document.querySelector(".lw-hotbar-slot");
    expect(first?.textContent).toContain("Wood");
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Wood");
    hud.dispose();
  });

  it("tryPickup adds the stack, toasts it, and returns true (E0.5)", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    const applied = hud.tryPickup("wood", 3);
    expect(applied).toBe(true);
    expect(hud.inventory.count("wood")).toBe(3);
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Wood");
    hud.dispose();
  });

  it("tryPickup returns false and mutates nothing when the bag is completely full", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "stone", count: 27 * 64 }]); // fills every one of the 27 slots
    const before = hud.inventory;
    const applied = hud.tryPickup("wood", 1);
    expect(applied).toBe(false);
    expect(hud.inventory).toBe(before);
    expect(hud.inventory.count("wood")).toBe(0);
    hud.dispose();
  });

  it("setCrosshairState reflects onto the mounted crosshair", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.setCrosshairState("mine");
    expect(document.querySelector<HTMLElement>(".lw-crosshair")?.dataset.state).toBe("mine");
    hud.dispose();
  });

  it("seeds inventory/progression/keyhints from initial* opts (S7b persistence)", () => {
    const reg = registry();
    const seeded = Inventory.empty(reg, 27).add("wood", 7);
    if (!isOk(seeded)) throw new Error("setup");
    const progression = recordProgressionEvent(emptyProgression(), "craft", TUTORIAL_OBJECTIVES, ACHIEVEMENTS)
      .state;
    const keyhints = markKeyhintShown(markKeyhintShown({ shown: [] }, "eat"), "tame");
    const hud = mountGameHud({
      loc: createLocalizer("en"),
      registry: reg,
      initialInventory: seeded.value,
      initialProgression: progression,
      initialKeyhints: keyhints,
    });
    expect(hud.inventory.count("wood")).toBe(7);
    expect(hud.progression.counts).toEqual(progression.counts);
    expect(hud.keyhints.shown).toEqual(["eat", "tame"]);
    hud.dispose();
  });

  it("toast pushes a localized message onto the toast host", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.toast("hud.toast.spawnSet");
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Spawn point set");
    hud.dispose();
  });

  it("maybeShowInteractHint shows the [E] keyhint once", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.maybeShowInteractHint();
    expect(document.querySelector(".lw-keyhint-prompt")?.textContent).toContain("E");
    hud.dispose();
  });

  it("dispose removes all mounted HUD elements", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.dispose();
    expect(document.querySelector(".lw-hotbar")).toBeNull();
    expect(document.querySelector(".lw-toast-region")).toBeNull();
    expect(document.querySelector(".lw-crosshair")).toBeNull();
    expect(document.querySelector(".lw-inv-overlay")).toBeNull();
    expect(document.querySelector(".lw-inv-open-button")).toBeNull();
  });

  it("the mouse-only inventory-open button toggles the overlay with no keyboard", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    const openButton = document.querySelector<HTMLButtonElement>(".lw-inv-open-button");
    expect(openButton).toBeTruthy();
    openButton?.click();
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(false);
    openButton?.click();
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(true);
    hud.dispose();
  });

  it("wires the I key to the inventory overlay and calls setInputEnabled on open/close", () => {
    const setInputEnabled = vi.fn();
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry(), setInputEnabled });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true }));
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true }));
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    hud.dispose();
  });

  it("addLoot also updates the inventory overlay's grid", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "wood", count: 2 }]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true }));
    const cells = document.querySelectorAll(".lw-inv-slot");
    const hasWood = [...cells].some((c) => c.textContent?.includes("Wood"));
    expect(hasWood).toBe(true);
    hud.dispose();
  });

  it("eatSelected consumes a food item in the selected hotbar slot and calls onEat", () => {
    const onEat = vi.fn();
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry(), onEat });
    hud.addLoot([{ itemId: "meat", count: 2 }]);
    expect(hud.eatSelected()).toBe(true);
    expect(hud.inventory.count("meat")).toBe(1);
    expect(onEat).toHaveBeenCalledWith({ hungerRestore: 25, healthRestore: 5 });
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Meat");
    hud.dispose();
  });

  it("eatSelected is a no-op on an empty slot or a non-food item", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    expect(hud.eatSelected()).toBe(false); // empty hotbar
    hud.addLoot([{ itemId: "wood", count: 1 }]);
    expect(hud.eatSelected()).toBe(false); // wood isn't food
    hud.dispose();
  });

  it("the H key eats the selected item", () => {
    const onEat = vi.fn();
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry(), onEat });
    hud.addLoot([{ itemId: "berries", count: 1 }]);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", bubbles: true }));
    expect(onEat).toHaveBeenCalledTimes(1);
    hud.dispose();
  });

  it("applyDeathPenalty keep-inventory leaves the inventory untouched", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "wood", count: 5 }]);
    hud.applyDeathPenalty("keep-inventory");
    expect(hud.inventory.count("wood")).toBe(5);
    hud.dispose();
  });

  it("applyDeathPenalty drop-all clears the inventory", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "wood", count: 5 }]);
    hud.applyDeathPenalty("drop-all");
    expect(hud.inventory.count("wood")).toBe(0);
    hud.dispose();
  });

  it("mounts the objective tracker showing the first tutorial step", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    expect(document.querySelector(".lw-objective-tracker")?.textContent).toContain(
      "Harvest a resource",
    );
    hud.dispose();
  });

  it("recordProgress advances the tutorial chain, toasts completion, and unlocks tier 1 on craft", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.recordProgress("harvest");
    expect(hud.progression.completedObjectives).toContain("tut-harvest");
    expect(document.querySelector(".lw-objective-tracker")?.textContent).toContain("Craft something");

    hud.recordProgress("craft");
    expect(hud.progression.completedObjectives).toContain("tut-craft");
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Objective complete");
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Achievement unlocked");

    // tier-1 recipes (e.g. ingot) are now unlocked in the live crafting screen
    const openButton = document.querySelector<HTMLButtonElement>(".lw-inv-open-button");
    openButton?.click();
    const craftingTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Crafting");
    craftingTab?.click();
    expect(document.querySelector('[data-recipe-id="ingot"]')?.getAttribute("data-locked")).toBe("false");
    hud.dispose();
  });

  it("eatSelected feeds the eat progression event", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "meat", count: 1 }]);
    hud.eatSelected();
    expect(hud.progression.completedObjectives).not.toContain("tut-eat"); // prereq chain not yet reached
    expect(hud.progression.unlockedAchievements).toContain("first-eat");
    hud.dispose();
  });

  it("shows the eat keyhint once, the first time food enters the inventory", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "meat", count: 1 }]);
    expect(document.querySelectorAll(".lw-keyhint-prompt")).toHaveLength(1);
    hud.addLoot([{ itemId: "berries", count: 1 }]);
    expect(document.querySelectorAll(".lw-keyhint-prompt")).toHaveLength(1); // shown only once
    hud.dispose();
  });

  it("maybeShowTameHint shows the tame keyhint once", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.maybeShowTameHint();
    hud.maybeShowTameHint();
    const prompts = [...document.querySelectorAll(".lw-keyhint-prompt")];
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.textContent).toContain("Feed");
    hud.dispose();
  });

  it("loads item-filter rules from the injected store and applies them to the inventory overlay", async () => {
    const store = new InMemoryItemFilterStore();
    await store.save([{ id: "r1", enabled: true, match: { kind: "tag", tag: "food" }, action: "highlight" }]);
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry(), filterStore: store });
    hud.addLoot([{ itemId: "meat", count: 1 }]);
    await Promise.resolve(); // let the async filterStore.load() resolve
    await Promise.resolve();
    const openButton = document.querySelector<HTMLButtonElement>(".lw-inv-open-button");
    openButton?.click();
    const meatCell = [...document.querySelectorAll<HTMLElement>(".lw-inv-slot")].find((c) =>
      c.textContent?.includes("Meat"),
    );
    expect(meatCell?.dataset.filterAction).toBe("highlight");
    hud.dispose();
  });

  it("persists an item-filter rule added through the Filter tab", async () => {
    const store = new InMemoryItemFilterStore();
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry(), filterStore: store });
    await Promise.resolve();
    await Promise.resolve();
    const openButton = document.querySelector<HTMLButtonElement>(".lw-inv-open-button");
    openButton?.click();
    const filterTab = [...document.querySelectorAll("button")].find((b) => b.textContent === "Filter");
    filterTab?.click();
    document.querySelector<HTMLButtonElement>(".lw-filter-add button[type='submit']")?.click();

    const saved = await store.load();
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.length).toBe(defaultFilterRules().length + 1);
    hud.dispose();
  });

  it("achievements tab is available and reflects unlocked achievements", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.recordProgress("dig");
    const openButton = document.querySelector<HTMLButtonElement>(".lw-inv-open-button");
    openButton?.click();
    const achievementsTab = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Achievements",
    );
    expect(achievementsTab).toBeTruthy();
    achievementsTab?.click();
    expect(document.querySelector('[data-achievement-id="first-dig"]')?.getAttribute("data-unlocked")).toBe(
      "true",
    );
    hud.dispose();
  });

  // E1.5b: CharacterScreen is mounted the same way InventoryScreen is.
  it("mounts a character-sheet open button and the C key toggles the overlay", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    const openButton = document.querySelector<HTMLButtonElement>(".lw-character-open-button");
    expect(openButton).toBeTruthy();
    openButton?.click();
    expect(document.querySelector('[aria-label="Character"]')?.hasAttribute("hidden")).toBe(false);
    openButton?.click();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(document.querySelector('[aria-label="Character"]')?.hasAttribute("hidden")).toBe(false);
    hud.dispose();
  });

  it("dispose also removes the character-sheet button and overlay", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.dispose();
    expect(document.querySelector(".lw-character-open-button")).toBeNull();
    expect(document.querySelector('[aria-label="Character"]')).toBeNull();
  });

  it("seeds the character from initialCharacter (S7b-style persistence seam)", () => {
    const seeded = { ...newCharacter(), level: { level: 3, xp: 10 } };
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry(), initialCharacter: seeded });
    expect(hud.character.level.level).toBe(3);
    hud.dispose();
  });

  // E1.4b: recordProgress (already the single entry point every dig/craft/
  // kill/harvest/tame call site threads through) actually grants XP into the
  // character's leveling at runtime — not just at the domain-test level.
  it("recordProgress grants XP into the character's leveling at runtime", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    expect(hud.character.level.xp).toBe(0);
    hud.recordProgress("dig");
    expect(hud.character.level.xp).toBe(XP_PER_EVENT.dig);
    hud.dispose();
  });

  it("recordProgress toasts on level-up and onCharacterChange fires", () => {
    const onCharacterChange = vi.fn();
    const hud = mountGameHud({
      loc: createLocalizer("en"),
      registry: registry(),
      onCharacterChange,
    });
    // "tame" grants the most XP per event; force enough events to cross the
    // level-1 threshold deterministically regardless of the curve's shape.
    const needed = Math.ceil(xpForLevel(1) / XP_PER_EVENT.tame);
    for (let i = 0; i < needed; i++) hud.recordProgress("tame");
    expect(hud.character.level.level).toBeGreaterThan(1);
    expect(document.querySelector(".lw-toast-region")?.textContent).toContain("Level up!");
    expect(onCharacterChange).toHaveBeenCalledWith(hud.character);
    hud.dispose();
  });

  it("starts with an empty bank and exposes it via the bank getter", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    expect(hud.bank.tab("shared").totalCount()).toBe(0);
    hud.dispose();
  });

  it("the mouse-only bank-open button and the K key both toggle the bank overlay", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    const bankButton = document.querySelector<HTMLButtonElement>(".lw-bank-open-button");
    expect(bankButton).toBeTruthy();
    bankButton?.click();
    expect(document.querySelector('[aria-label="Bank"]')?.hasAttribute("hidden")).toBe(false);
    bankButton?.click();
    expect(document.querySelector('[aria-label="Bank"]')?.hasAttribute("hidden")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(document.querySelector('[aria-label="Bank"]')?.hasAttribute("hidden")).toBe(false);
    hud.dispose();
  });

  it("depositing into the bank overlay updates hud.bank and does not disturb the I-key inventory binding", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.addLoot([{ itemId: "wood", count: 4 }]);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    const bankOverlay = document.querySelector('[aria-label="Bank"]') as HTMLElement;
    const grids = bankOverlay.querySelectorAll(".lw-inv-grid");
    const playerSlot = grids[0].querySelector('[role="gridcell"]') as HTMLElement;
    const bankSlot = grids[1].querySelector('[role="gridcell"]') as HTMLElement;
    playerSlot.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), {
        dataTransfer: { setData: () => {}, getData: () => {} },
      }),
    );
    bankSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(hud.bank.tab("shared").count("wood")).toBe(4);
    expect(hud.inventory.count("wood")).toBe(0);

    // The I key still opens the (distinct) inventory overlay unaffected.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", bubbles: true }));
    expect(document.querySelector(".lw-inv-overlay")?.hasAttribute("hidden")).toBe(false);
    hud.dispose();
  });
});
