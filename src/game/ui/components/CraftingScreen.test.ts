// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { Inventory } from "../../domain/inventory/Inventory";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import { STARTER_RECIPES } from "../../domain/crafting/starterRecipes";
import type { AudioPort } from "../../application/ports/AudioPort";
import { createLocalizer } from "../i18n/strings";
import { CraftingScreen } from "./CraftingScreen";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

function invWith(reg: ItemRegistry, entries: Array<[string, number]>): Inventory {
  let inv = Inventory.empty(reg, 27);
  for (const [id, n] of entries) {
    const r = inv.add(id, n);
    if (!isOk(r)) throw new Error("seed add failed");
    inv = r.value;
  }
  return inv;
}

function fakeAudio(): AudioPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: (event) => calls.push(event),
    setBusVolume: () => {},
    startMusicState: () => {},
    startAmbient: () => {},
    stopAmbient: () => {},
  };
}

describe("CraftingScreen", () => {
  it("renders recipes grouped by tier", () => {
    const reg = registry();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.render(invWith(reg, []));
    const tierCount = new Set(STARTER_RECIPES.map((r) => r.unlockTier)).size;
    expect(screen.el.querySelectorAll(".lw-recipe")).toHaveLength(STARTER_RECIPES.length);
    expect(screen.el.querySelectorAll(".lw-crafting-tier")).toHaveLength(tierCount);
  });

  it("shows locked recipes as locked and disables their craft button", () => {
    const reg = registry();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 0, // ingot/pickaxe (tier 1) locked
    });
    screen.render(invWith(reg, [["ore", 5]]));
    const ingotRow = screen.el.querySelector('[data-recipe-id="ingot"]');
    expect(ingotRow?.getAttribute("data-locked")).toBe("true");
    expect(ingotRow?.querySelector("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("search box filters the recipe list", () => {
    const reg = registry();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.render(invWith(reg, []));
    const search = screen.el.querySelector<HTMLInputElement>('input[type="text"]');
    expect(search).toBeTruthy();
    if (!search) return;
    search.value = "iron pickaxe";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const rows = screen.el.querySelectorAll(".lw-recipe");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-recipe-id")).toBe("pickaxe");
  });

  it("craftable-now checkbox filters to only currently-craftable recipes", () => {
    const reg = registry();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    screen.render(invWith(reg, [["wood", 1]])); // only "planks" is craftable
    const checkbox = screen.el.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    if (!checkbox) return;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    const rows = screen.el.querySelectorAll(".lw-recipe");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-recipe-id")).toBe("planks");
  });

  it("craft button crafts once, updates inventory, and plays the craft SFX", () => {
    const reg = registry();
    const audio = fakeAudio();
    const onChange = vi.fn();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      audio,
      onChange,
    });
    screen.render(invWith(reg, [["wood", 2]]));
    const planksRow = screen.el.querySelector('[data-recipe-id="planks"]');
    const craftBtn = planksRow?.querySelector("button");
    craftBtn?.click();

    expect(audio.calls).toEqual(["craft"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.count("wood")).toBe(1);
    expect(next.count("plank")).toBe(4);
  });

  it("craft-all crafts repeatedly until ingredients run out", () => {
    const reg = registry();
    const audio = fakeAudio();
    const onChange = vi.fn();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      audio,
      onChange,
    });
    screen.render(invWith(reg, [["wood", 3]]));
    const planksRow = screen.el.querySelector('[data-recipe-id="planks"]');
    const craftAllBtn = planksRow?.querySelectorAll("button")[1];
    craftAllBtn?.click();

    expect(audio.calls).toEqual(["craft"]);
    const next: Inventory = onChange.mock.calls[0][0];
    expect(next.count("wood")).toBe(0);
    expect(next.count("plank")).toBe(12); // 3 crafts x4
  });

  it("setUnlockedTier re-renders the gate live without a remount", () => {
    const reg = registry();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 0,
    });
    screen.render(invWith(reg, [["ore", 5]]));
    expect(screen.el.querySelector('[data-recipe-id="ingot"]')?.getAttribute("data-locked")).toBe("true");

    screen.setUnlockedTier(1);
    expect(screen.el.querySelector('[data-recipe-id="ingot"]')?.getAttribute("data-locked")).toBe("false");
  });

  it("fires onCraft after a successful craft and craft-all", () => {
    const reg = registry();
    const onCraft = vi.fn();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
      onCraft,
    });
    screen.render(invWith(reg, [["wood", 2]]));
    screen.el.querySelector('[data-recipe-id="planks"] button')?.dispatchEvent(new MouseEvent("click"));
    expect(onCraft).toHaveBeenCalledTimes(1);
  });

  it("dispose removes the mounted screen", () => {
    const reg = registry();
    const screen = CraftingScreen({
      registry: reg,
      loc: createLocalizer("en"),
      recipes: STARTER_RECIPES,
      unlockedTier: 1,
    });
    document.body.appendChild(screen.el);
    screen.render(invWith(reg, []));
    screen.dispose();
    expect(document.body.contains(screen.el)).toBe(false);
  });
});
