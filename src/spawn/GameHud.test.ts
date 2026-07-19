// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../game/domain/Result";
import { ItemRegistry } from "../game/domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../game/domain/items/starterItems";
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

  it("setCrosshairState reflects onto the mounted crosshair", () => {
    const hud = mountGameHud({ loc: createLocalizer("en"), registry: registry() });
    hud.setCrosshairState("mine");
    expect(document.querySelector<HTMLElement>(".lw-crosshair")?.dataset.state).toBe("mine");
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
});
