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
import { transferBetween } from "../../domain/inventory/CrossInventoryTransfer";
import { Inventory } from "../../domain/inventory/Inventory";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { Localizer } from "../../application/i18n/Localizer";
import { Button } from "./Button";
import { InventoryGrid } from "./InventoryGrid";
import { Panel } from "./Panel";
import { injectStyles } from "../styles";

export interface ChestScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  setInputEnabled?(enabled: boolean): void;
  readonly doc?: Document;
  /** E0.4 wave-3: true for a JOINER — a cross-grid drop (deposit/withdraw)
   *  never mutates either `Inventory` locally; it only fires
   *  `onTransferIntent` and waits for the host's authoritative reply
   *  (`render()` below). Read live at drop-time (a function, not a snapshot)
   *  because host-local vs. joiner is only known after this screen mounts. */
  isRemote?(): boolean;
  /** Fired instead of a local transfer when `isRemote()` is true — the whole
   *  slot's stack (matches `transferBetween`'s "moves the whole stack"
   *  contract) as a host `inventoryOp` deposit/withdraw. */
  onTransferIntent?(direction: "deposit" | "withdraw", itemId: string, count: number): void;
}

export interface ChestScreenHandle {
  readonly isOpen: boolean;
  /** Opens against a chest inventory; `onChange` fires with BOTH updated
   *  inventories after any LOCAL transfer (host-local play only — the caller
   *  persists the chest side; a joiner never gets this callback for a
   *  cross-grid transfer, see `isRemote`/`onTransferIntent`). */
  open(
    playerInventory: Inventory,
    chestInventory: Inventory,
    onChange: (player: Inventory, chest: Inventory) => void,
  ): void;
  /** Reconciles both grids from the host's authoritative state while open
   *  (E0.4 wave-3) — a joiner's only path to seeing a transfer's real
   *  outcome, since remote drops never mutate locally. A no-op if closed. */
  render(playerInventory: Inventory, chestInventory: Inventory): void;
  close(): void;
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
    doc,
    onChange: (next) => {
      player = next;
      onChange?.(player, chest);
    },
    onExternalDrop: (sourceGridId, sourceIndex, targetIndex) => {
      if (sourceGridId !== "chest-chest") return;
      if (opts.isRemote?.()) {
        const slot = chest.slots[sourceIndex];
        if (!slot) return;
        opts.onTransferIntent?.("withdraw", slot.itemId, slot.count);
        return;
      }
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
    doc,
    onChange: (next) => {
      chest = next;
      onChange?.(player, chest);
    },
    onExternalDrop: (sourceGridId, sourceIndex, targetIndex) => {
      if (sourceGridId !== "chest-player") return;
      if (opts.isRemote?.()) {
        const slot = player.slots[sourceIndex];
        if (!slot) return;
        opts.onTransferIntent?.("deposit", slot.itemId, slot.count);
        return;
      }
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

  const body = doc.createElement("div");
  body.className = "lw-chest-body";
  body.append(playerGrid.el, chestGrid.el);

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
    render(playerInventory, chestInventory): void {
      if (!open) return;
      player = playerInventory;
      chest = chestInventory;
      playerGrid.render(player);
      chestGrid.render(chest);
    },
    close,
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      playerGrid.dispose();
      chestGrid.dispose();
      overlay.remove();
    },
  };
}
