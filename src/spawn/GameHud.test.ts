// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
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
  });
});
