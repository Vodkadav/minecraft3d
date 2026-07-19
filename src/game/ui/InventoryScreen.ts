/**
 * InventoryScreen — the togglable overlay composing InventoryGrid + CraftingScreen
 * (Workstream 4). `I` opens/closes it (ignored while a text input elsewhere
 * has focus, so typing "i" in the crafting search box never closes the
 * overlay); Escape always closes it. Opening releases pointer lock and pauses
 * camera-look input via `setInputEnabled` (studied from `FlyCamera`'s
 * `hooks.flyCamEnabled` seam in TerrainScene) so the mouse is free to
 * drag/click inside the panel; closing restores it (the player re-acquires
 * pointer lock with the next click, exactly like every other input-pause in
 * this codebase — see Bookmarks.ts / main.ts's flythrough).
 */

import type { Recipe } from "../domain/crafting/Crafting";
import { Inventory } from "../domain/inventory/Inventory";
import type { ItemRegistry } from "../domain/items/ItemRegistry";
import type { AudioPort } from "../application/ports/AudioPort";
import type { Localizer } from "../application/i18n/Localizer";
import { Button } from "./components/Button";
import { CraftingScreen } from "./components/CraftingScreen";
import { InventoryGrid } from "./components/InventoryGrid";
import { Panel } from "./components/Panel";
import { injectStyles } from "./styles";

export interface InventoryScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  readonly recipes: readonly Recipe[];
  readonly unlockedTier: number;
  readonly audio?: AudioPort;
  /** Pauses/resumes camera-look input; called on open(false)/close(true). */
  setInputEnabled?(enabled: boolean): void;
  onInventoryChange?(next: Inventory): void;
  readonly doc?: Document;
}

export interface InventoryScreenHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  setInventory(inventory: Inventory): void;
  readonly inventory: Inventory;
  dispose(): void;
}

type Tab = "inventory" | "crafting";

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountInventoryScreen(opts: InventoryScreenOptions): InventoryScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let inventory = Inventory.empty(opts.registry, 27);
  let open = false;
  let tab: Tab = "inventory";

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("inventory.title"));

  const tabs = doc.createElement("div");
  tabs.className = "lw-inv-tabs";
  const inventoryTabBtn = doc.createElement("button");
  inventoryTabBtn.type = "button";
  inventoryTabBtn.className = "laas-ui lw-button";
  inventoryTabBtn.textContent = opts.loc.t("inventory.tab.inventory");
  const craftingTabBtn = doc.createElement("button");
  craftingTabBtn.type = "button";
  craftingTabBtn.className = "laas-ui lw-button";
  craftingTabBtn.dataset.variant = "quiet";
  craftingTabBtn.textContent = opts.loc.t("inventory.tab.crafting");
  tabs.append(inventoryTabBtn, craftingTabBtn);

  const closeBtn = Button({
    label: opts.loc.t("inventory.close"),
    ariaLabel: opts.loc.t("inventory.close.aria"),
    variant: "quiet",
    onClick: () => close(),
  });

  const header = doc.createElement("div");
  header.className = "lw-inv-header";
  header.append(tabs, closeBtn);

  const grid = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("inventory.tab.inventory"),
    doc,
    onChange: (next) => {
      inventory = next;
      opts.onInventoryChange?.(next);
      craftScreen.render(inventory);
    },
  });

  const craftScreen = CraftingScreen({
    registry: opts.registry,
    loc: opts.loc,
    recipes: opts.recipes,
    unlockedTier: opts.unlockedTier,
    ...(opts.audio ? { audio: opts.audio } : {}),
    doc,
    onChange: (next) => {
      inventory = next;
      opts.onInventoryChange?.(next);
      grid.render(inventory);
    },
  });

  const body = doc.createElement("div");
  body.appendChild(grid.el);

  const panel = Panel([header, body], { className: "lw-inv-overlay-panel" });
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);

  function applyTab(): void {
    inventoryTabBtn.dataset.variant = tab === "inventory" ? "" : "quiet";
    inventoryTabBtn.setAttribute("aria-selected", String(tab === "inventory"));
    craftingTabBtn.dataset.variant = tab === "crafting" ? "" : "quiet";
    craftingTabBtn.setAttribute("aria-selected", String(tab === "crafting"));
    body.replaceChildren(tab === "inventory" ? grid.el : craftScreen.el);
  }
  inventoryTabBtn.addEventListener("click", () => {
    tab = "inventory";
    applyTab();
  });
  craftingTabBtn.addEventListener("click", () => {
    tab = "crafting";
    applyTab();
  });
  applyTab();

  function open_(): void {
    if (open) return;
    open = true;
    overlay.hidden = false;
    grid.render(inventory);
    craftScreen.render(inventory);
    doc.exitPointerLock?.();
    opts.setInputEnabled?.(false);
    (tab === "inventory" ? grid.el : craftScreen.el).querySelector<HTMLElement>("[tabindex]")?.focus();
  }
  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    opts.setInputEnabled?.(true);
  }
  function toggle(): void {
    if (open) close();
    else open_();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      return;
    }
    if ((e.key === "i" || e.key === "I") && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      toggle();
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    open: open_,
    close,
    toggle,
    setInventory(next: Inventory): void {
      inventory = next;
      if (open) {
        grid.render(inventory);
        craftScreen.render(inventory);
      }
    },
    get inventory() {
      return inventory;
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      grid.dispose();
      craftScreen.dispose();
      overlay.remove();
    },
  };
}
