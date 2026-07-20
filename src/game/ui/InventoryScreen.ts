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
import { autosort, SORT_KEYS, type SortKey } from "../domain/inventory/InventorySort";
import { defaultFilterRules, type FilterRule } from "../domain/inventory/ItemFilter";
import type { ItemRegistry } from "../domain/items/ItemRegistry";
import type { Achievement } from "../domain/progression/ProgressionState";
import type { AudioPort } from "../application/ports/AudioPort";
import type { Localizer } from "../application/i18n/Localizer";
import { AchievementsScreen } from "./components/AchievementsScreen";
import { Button } from "./components/Button";
import { CraftingScreen } from "./components/CraftingScreen";
import { InventoryGrid } from "./components/InventoryGrid";
import { ItemFilterEditor } from "./components/ItemFilterEditor";
import { WindowFrame } from "./components/WindowFrame";
import { injectStyles } from "./styles";

export interface InventoryScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  readonly recipes: readonly Recipe[];
  readonly unlockedTier: number;
  readonly audio?: AudioPort;
  /** Achievement definitions for the third tab (Workstream 6.4) — omitted
   *  entirely hides the tab (keeps this screen usable pre-Workstream-6). */
  readonly achievements?: readonly Achievement[];
  /** Starting item-filter rule set (Workstream E4.2) — defaults to the
   *  small built-in starter set; the composition root loads/persists the
   *  actual player rules and threads them in + reacts to `onFilterRulesChange`. */
  readonly filterRules?: readonly FilterRule[];
  onFilterRulesChange?(rules: readonly FilterRule[]): void;
  /** Pauses/resumes camera-look input; called on open(false)/close(true). */
  setInputEnabled?(enabled: boolean): void;
  onInventoryChange?(next: Inventory): void;
  /** Fired after a successful craft/craft-all — threads through to the
   *  composition root's progression event stream (Workstream 6). */
  onCraft?(): void;
  /** E8.5: shift-click / "Link to chat" on a slot links the item into the
   *  chat composer — threaded to the grid, wired by the composition root that
   *  owns the chat box (`GameHud` ← TerrainScene). */
  onLinkItem?(itemId: string): void;
  readonly doc?: Document;
}

export interface InventoryScreenHandle {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  setInventory(inventory: Inventory): void;
  readonly inventory: Inventory;
  /** Live recipe-tier gate update (Workstream 6.1) — no remount required. */
  setUnlockedTier(tier: number): void;
  /** Re-renders the achievements grid against the given unlocked-id set. */
  setUnlockedAchievements(unlockedIds: readonly string[]): void;
  /** Live item-filter rule update (e.g. once the composition root's async
   *  store load resolves) — no remount required. */
  setFilterRules(rules: readonly FilterRule[]): void;
  dispose(): void;
}

type Tab = "inventory" | "crafting" | "achievements" | "filter";

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountInventoryScreen(opts: InventoryScreenOptions): InventoryScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let inventory = Inventory.empty(opts.registry, 27);
  let filterRules: readonly FilterRule[] = opts.filterRules ?? defaultFilterRules();
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
  const achievementsTabBtn = doc.createElement("button");
  achievementsTabBtn.type = "button";
  achievementsTabBtn.className = "laas-ui lw-button";
  achievementsTabBtn.dataset.variant = "quiet";
  achievementsTabBtn.textContent = opts.loc.t("inventory.tab.achievements");
  const filterTabBtn = doc.createElement("button");
  filterTabBtn.type = "button";
  filterTabBtn.className = "laas-ui lw-button";
  filterTabBtn.dataset.variant = "quiet";
  filterTabBtn.textContent = opts.loc.t("inventory.tab.filter");
  tabs.append(
    inventoryTabBtn,
    craftingTabBtn,
    ...(opts.achievements ? [achievementsTabBtn] : []),
    filterTabBtn,
  );

  const grid = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("inventory.tab.inventory"),
    filterRules,
    doc,
    onChange: (next) => {
      inventory = next;
      opts.onInventoryChange?.(next);
      craftScreen.render(inventory);
    },
    ...(opts.onLinkItem ? { onLinkItem: opts.onLinkItem } : {}),
  });

  // ---- sort toolbar (Workstream E4.1) ----
  const sortKeySelect = doc.createElement("select");
  sortKeySelect.setAttribute("aria-label", opts.loc.t("inventory.sort.key"));
  for (const key of SORT_KEYS) {
    const o = doc.createElement("option");
    o.value = key;
    o.textContent = opts.loc.t(`inventory.sort.key.${key}`);
    sortKeySelect.appendChild(o);
  }
  const sortButton = Button({
    label: opts.loc.t("inventory.sort"),
    ariaLabel: opts.loc.t("inventory.sort.aria"),
    variant: "quiet",
    onClick: () => {
      const next = autosort(opts.registry, inventory, sortKeySelect.value as SortKey);
      inventory = next;
      opts.onInventoryChange?.(next);
      grid.render(inventory);
      craftScreen.render(inventory);
    },
  });
  const sortToolbar = doc.createElement("div");
  sortToolbar.className = "lw-inv-sort-toolbar";
  sortToolbar.append(sortKeySelect, sortButton);

  const inventoryBody = doc.createElement("div");
  inventoryBody.className = "lw-inv-tab-body";
  inventoryBody.append(sortToolbar, grid.el);

  // ---- item filter editor (Workstream E4.2) ----
  const filterEditor = ItemFilterEditor({
    loc: opts.loc,
    registry: opts.registry,
    doc,
    onChange: (next) => {
      filterRules = next;
      grid.setFilterRules(filterRules);
      opts.onFilterRulesChange?.(filterRules);
    },
  });
  filterEditor.render(filterRules);

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
    ...(opts.onCraft ? { onCraft: opts.onCraft } : {}),
  });

  const achievementsScreen = opts.achievements
    ? AchievementsScreen(opts.loc, opts.achievements, { doc })
    : null;

  const body = doc.createElement("div");
  body.appendChild(inventoryBody);

  const frame = WindowFrame({
    doc,
    title: opts.loc.t("inventory.title"),
    titleVisuallyHidden: true,
    headerExtra: tabs,
    close: {
      label: opts.loc.t("inventory.close"),
      ariaLabel: opts.loc.t("inventory.close.aria"),
      onClose: () => close(),
    },
    body: [body],
    panelClassName: "lw-inv-overlay-panel",
  });
  overlay.appendChild(frame.panel);
  doc.body.appendChild(overlay);

  function elFor(t: Tab): HTMLElement {
    if (t === "crafting") return craftScreen.el;
    if (t === "achievements" && achievementsScreen) return achievementsScreen.el;
    if (t === "filter") return filterEditor.el;
    return inventoryBody;
  }
  function applyTab(): void {
    inventoryTabBtn.dataset.variant = tab === "inventory" ? "" : "quiet";
    inventoryTabBtn.setAttribute("aria-selected", String(tab === "inventory"));
    craftingTabBtn.dataset.variant = tab === "crafting" ? "" : "quiet";
    craftingTabBtn.setAttribute("aria-selected", String(tab === "crafting"));
    achievementsTabBtn.dataset.variant = tab === "achievements" ? "" : "quiet";
    achievementsTabBtn.setAttribute("aria-selected", String(tab === "achievements"));
    filterTabBtn.dataset.variant = tab === "filter" ? "" : "quiet";
    filterTabBtn.setAttribute("aria-selected", String(tab === "filter"));
    body.replaceChildren(elFor(tab));
  }
  inventoryTabBtn.addEventListener("click", () => {
    tab = "inventory";
    applyTab();
  });
  craftingTabBtn.addEventListener("click", () => {
    tab = "crafting";
    applyTab();
  });
  achievementsTabBtn.addEventListener("click", () => {
    tab = "achievements";
    applyTab();
  });
  filterTabBtn.addEventListener("click", () => {
    tab = "filter";
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
    elFor(tab).querySelector<HTMLElement>("[tabindex]")?.focus();
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
    setUnlockedTier(tier: number): void {
      craftScreen.setUnlockedTier(tier);
    },
    setUnlockedAchievements(unlockedIds: readonly string[]): void {
      achievementsScreen?.render(unlockedIds);
    },
    setFilterRules(rules: readonly FilterRule[]): void {
      filterRules = rules;
      grid.setFilterRules(filterRules);
      filterEditor.render(filterRules);
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      grid.dispose();
      craftScreen.dispose();
      achievementsScreen?.dispose();
      filterEditor.dispose();
      overlay.remove();
    },
  };
}
