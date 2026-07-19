/**
 * ChestScreen — the two-grid storage container overlay (Workstream 8.1
 * task 2 / S7b), reusing the Workstream-4 `InventoryGrid` for BOTH sides (the
 * "container UI reuse" plan explicitly asks for). Drag between the grids uses
 * `InventoryGrid`'s existing `onExternalDrop` cross-grid seam; deposit/
 * withdraw is domain `transferBetween` on two live `Inventory` instances —
 * the same seam `Chest.ts`'s doc comment names. `E`/click reopens it against
 * a different chest by calling `open(chestInventory, onChange)` again.
 * Escape closes it (mirrors InventoryScreen exactly, including pointer-lock
 * release + `setInputEnabled`).
 */

import { isOk } from "../../domain/Result";
import { autosort } from "../../domain/inventory/InventorySort";
import { transferBetween } from "../../domain/inventory/CrossInventoryTransfer";
import { Inventory } from "../../domain/inventory/Inventory";
import type { FilterRule } from "../../domain/inventory/ItemFilter";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { Localizer } from "../../application/i18n/Localizer";
import { Button } from "./Button";
import { InventoryGrid } from "./InventoryGrid";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface ChestScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  /** Item-filter rules (Workstream E4.2), read-only here — the rule
   *  BUILDER lives in `InventoryScreen`'s Filter tab; the chest only
   *  applies whatever the player last saved there. */
  readonly filterRules?: readonly FilterRule[];
  setInputEnabled?(enabled: boolean): void;
  readonly doc?: Document;
}

export interface ChestScreenHandle {
  readonly isOpen: boolean;
  /** Opens against a chest inventory; `onChange` fires with BOTH updated
   *  inventories after any transfer (the caller persists the chest side). */
  open(
    playerInventory: Inventory,
    chestInventory: Inventory,
    onChange: (player: Inventory, chest: Inventory) => void,
  ): void;
  close(): void;
  /** Live item-filter rule update (e.g. once the composition root's async
   *  store load resolves) — no remount required. */
  setFilterRules(rules: readonly FilterRule[]): void;
  dispose(): void;
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountChestScreen(opts: ChestScreenOptions): ChestScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let open = false;
  let player = Inventory.empty(opts.registry, 0);
  let chest = Inventory.empty(opts.registry, 0);
  let onChange: ((player: Inventory, chest: Inventory) => void) | null = null;

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("placeable.chest.title"));

  const closeBtn = Button({
    label: opts.loc.t("inventory.close"),
    ariaLabel: opts.loc.t("inventory.close.aria"),
    variant: "quiet",
    onClick: () => close(),
  });
  const header = doc.createElement("div");
  header.className = "lw-inv-header";
  const title = doc.createElement("h2");
  title.textContent = opts.loc.t("placeable.chest.title");
  header.append(title, closeBtn);

  const playerGrid = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("placeable.chest.player"),
    gridId: "chest-player",
    filterRules: opts.filterRules,
    doc,
    onChange: (next) => {
      player = next;
      onChange?.(player, chest);
    },
    onExternalDrop: (sourceGridId, sourceIndex, targetIndex) => {
      if (sourceGridId !== "chest-chest") return;
      const r = transferBetween(chest, player, sourceIndex);
      if (!isOk(r)) return;
      chest = r.value.from;
      player = r.value.to;
      playerGrid.render(player);
      chestGrid.render(chest);
      onChange?.(player, chest);
      void targetIndex; // landing slot is wherever `add` finds room (matches InventoryGrid drop contract)
    },
  });

  const chestGrid = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("placeable.chest.title"),
    hotbarSize: 0,
    gridId: "chest-chest",
    filterRules: opts.filterRules,
    doc,
    onChange: (next) => {
      chest = next;
      onChange?.(player, chest);
    },
    onExternalDrop: (sourceGridId, sourceIndex, targetIndex) => {
      if (sourceGridId !== "chest-player") return;
      const r = transferBetween(player, chest, sourceIndex);
      if (!isOk(r)) return;
      player = r.value.from;
      chest = r.value.to;
      playerGrid.render(player);
      chestGrid.render(chest);
      onChange?.(player, chest);
      void targetIndex;
    },
  });

  const sortPlayerBtn = Button({
    label: opts.loc.t("inventory.sort"),
    ariaLabel: opts.loc.t("placeable.chest.sort.player.aria"),
    variant: "quiet",
    onClick: () => {
      player = autosort(opts.registry, player);
      playerGrid.render(player);
      onChange?.(player, chest);
    },
  });
  const sortChestBtn = Button({
    label: opts.loc.t("inventory.sort"),
    ariaLabel: opts.loc.t("placeable.chest.sort.chest.aria"),
    variant: "quiet",
    onClick: () => {
      chest = autosort(opts.registry, chest);
      chestGrid.render(chest);
      onChange?.(player, chest);
    },
  });

  const playerColumn = doc.createElement("div");
  playerColumn.className = "lw-chest-column";
  playerColumn.append(sortPlayerBtn, playerGrid.el);
  const chestColumn = doc.createElement("div");
  chestColumn.className = "lw-chest-column";
  chestColumn.append(sortChestBtn, chestGrid.el);

  const body = doc.createElement("div");
  body.className = "lw-chest-body";
  body.append(playerColumn, chestColumn);

  const panel = Panel([header, body], { className: "lw-inv-overlay-panel" });
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);

  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    onChange = null;
    opts.setInputEnabled?.(true);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      close();
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    open(playerInventory, chestInventory, onChangeCb): void {
      player = playerInventory;
      chest = chestInventory;
      onChange = onChangeCb;
      open = true;
      overlay.hidden = false;
      playerGrid.render(player);
      chestGrid.render(chest);
      doc.exitPointerLock?.();
      opts.setInputEnabled?.(false);
    },
    close,
    setFilterRules(rules: readonly FilterRule[]): void {
      playerGrid.setFilterRules(rules);
      chestGrid.setFilterRules(rules);
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      playerGrid.dispose();
      chestGrid.dispose();
      overlay.remove();
    },
  };
}
