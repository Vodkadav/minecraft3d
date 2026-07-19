/**
 * InventoryGrid — a themed, keyboard-and-pointer-operable slot grid over the
 * domain `Inventory` model (Workstream 4, task 4.1). Generic over WHICH
 * inventory it renders (a `container`-style prop, task 4.3) so a future
 * storage-chest UI (Workstream 8) can mount a second instance beside the
 * player's and wire `onExternalDrop` to the pure
 * `domain/inventory/CrossInventoryTransfer.transferBetween` — this file
 * builds no chest UI itself.
 *
 * Interaction (all funnel through the pure `domain/ui/InventoryGridState`):
 *  - click a slot, click another -> pick then place (move/swap/merge)
 *  - drag a slot onto another -> same move/swap/merge (native HTML5 DnD;
 *    cross-grid drops call `onExternalDrop` instead of mutating locally)
 *  - arrow keys move a roving-tabindex cursor; Enter/Space activates it
 *    exactly like a click (pick then place)
 *  - right-click / contextmenu on a stack of 2+ splits it in half
 *  - double-click quick-moves between the hotbar zone and the backpack zone
 *  - Escape cancels a pending pick
 *
 * Tooltips (registry + localized name + count) via the shared Tooltip
 * component; every slot is a real, focusable, ARIA-labelled gridcell.
 */

import { isOk } from "../../domain/Result";
import { evaluateItemId, type FilterRule } from "../../domain/inventory/ItemFilter";
import { Inventory, type InventoryError } from "../../domain/inventory/Inventory";
import { quickMove } from "../../domain/inventory/QuickMove";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import {
  cancelPick,
  initialGridState,
  moveCursor,
  select,
  splitCount,
  type GridUiState,
} from "../../domain/ui/InventoryGridState";
import type { Localizer } from "../../application/i18n/Localizer";
import { itemDisplayName } from "../i18n/itemNames";
import { attachTooltip, type TooltipHandle } from "./Tooltip";
import { injectStyles } from "../styles";

const DEFAULT_COLS = 9;
const DEFAULT_HOTBAR_SIZE = 9;

let gridSeq = 0;
/** Module-scope so a drag started in one InventoryGrid instance can be
 *  recognized by another — the container-reuse seam (task 4.3). */
let activeDrag: { gridId: string; index: number } | null = null;

export interface InventoryGridOptions {
  readonly registry: ItemRegistry;
  readonly loc: Localizer;
  readonly ariaLabel: string;
  readonly cols?: number;
  /** Slots [0, hotbarSize) are the "hotbar zone" for quick-move + a visual
   *  divider; 0 disables both. */
  readonly hotbarSize?: number;
  readonly gridId?: string;
  /** Called after any successful in-grid mutation (move/swap/merge/split/quickmove). */
  onChange?(next: Inventory): void;
  /** A drag from a DIFFERENT InventoryGrid instance dropped onto this one —
   *  the composition root applies the transfer (unused until a second grid
   *  exists, e.g. a storage chest). */
  onExternalDrop?(sourceGridId: string, sourceIndex: number, targetIndex: number): void;
  /** Item-filter rules (Workstream E4.2) applied to every rendered slot as a
   *  `data-filter-action` attribute ("highlight"/"dim"/"hide"); omitted or
   *  empty renders every slot normally. */
  readonly filterRules?: readonly FilterRule[];
  readonly doc?: Document;
}

export interface InventoryGridHandle {
  readonly el: HTMLElement;
  render(inventory: Inventory): void;
  /** Live rule update (e.g. the filter editor tab changing a rule) — no
   *  remount required. */
  setFilterRules(rules: readonly FilterRule[]): void;
  dispose(): void;
}

export function InventoryGrid(opts: InventoryGridOptions): InventoryGridHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const cols = opts.cols ?? DEFAULT_COLS;
  const hotbarSize = opts.hotbarSize ?? DEFAULT_HOTBAR_SIZE;
  const gridId = opts.gridId ?? `inv-grid-${++gridSeq}`;

  const el = doc.createElement("div");
  el.className = "laas-ui lw-inv-grid";
  el.setAttribute("role", "grid");
  el.setAttribute("aria-label", opts.ariaLabel);

  let inventory = Inventory.empty(opts.registry, 0);
  let ui: GridUiState = initialGridState(0);
  let filterRules: readonly FilterRule[] = opts.filterRules ?? [];
  const slotEls: HTMLDivElement[] = [];
  const tooltips: TooltipHandle[] = [];

  function applyChange(result: { readonly ok: true; readonly value: Inventory } | { readonly ok: false; readonly error: InventoryError }): void {
    if (!isOk(result)) return; // rejected mutation (e.g. no room) — silently keeps state
    inventory = result.value;
    opts.onChange?.(inventory);
    renderSlots();
  }

  function nameFor(itemId: string): string {
    return itemDisplayName(opts.loc, opts.registry, itemId);
  }

  function buildRows(capacity: number): void {
    el.replaceChildren();
    slotEls.length = 0;
    tooltips.forEach((t) => t.dispose());
    tooltips.length = 0;

    const rows = Math.ceil(capacity / cols);
    for (let r = 0; r < rows; r++) {
      const rowEl = doc.createElement("div");
      rowEl.className = "lw-inv-row";
      rowEl.setAttribute("role", "row");
      for (let c = 0; c < cols; c++) {
        const index = r * cols + c;
        if (index >= capacity) break;
        const cell = doc.createElement("div");
        cell.className = "lw-inv-slot";
        cell.dataset.index = String(index);
        cell.setAttribute("role", "gridcell");
        cell.tabIndex = index === ui.cursor ? 0 : -1;
        cell.draggable = false;

        const name = doc.createElement("span");
        name.className = "lw-inv-slot-name";
        const count = doc.createElement("span");
        count.className = "lw-inv-slot-count";
        cell.append(name, count);

        if (hotbarSize > 0 && index === hotbarSize) {
          rowEl.classList.add("lw-inv-row-divider");
        }

        cell.addEventListener("click", () => onActivate(index));
        cell.addEventListener("keydown", (e) => onKeyDown(e as KeyboardEvent, index));
        cell.addEventListener("dblclick", () => onQuickMove(index));
        cell.addEventListener("contextmenu", (e) => onSplit(e as MouseEvent, index));
        cell.addEventListener("dragstart", (e) => onDragStart(e as DragEvent, index));
        cell.addEventListener("dragover", (e) => e.preventDefault());
        cell.addEventListener("drop", (e) => onDrop(e as DragEvent, index));

        slotEls.push(cell);
        rowEl.appendChild(cell);
      }
      el.appendChild(rowEl);
    }
  }

  function renderSlots(): void {
    if (slotEls.length !== inventory.capacity) buildRows(inventory.capacity);

    slotEls.forEach((cell, index) => {
      const slot = inventory.slots[index];
      const nameEl = cell.querySelector<HTMLElement>(".lw-inv-slot-name");
      const countEl = cell.querySelector<HTMLElement>(".lw-inv-slot-count");
      cell.tabIndex = index === ui.cursor ? 0 : -1;
      cell.dataset.picked = String(ui.picked === index);
      cell.draggable = slot !== null;

      tooltips[index]?.dispose();

      if (!slot) {
        if (nameEl) nameEl.textContent = "";
        if (countEl) countEl.textContent = "";
        cell.removeAttribute("data-filter-action");
        cell.setAttribute(
          "aria-label",
          opts.loc.t("inventory.slot.aria.empty", { n: index + 1 }),
        );
        cell.removeAttribute("aria-describedby");
        return;
      }
      const filterAction = evaluateItemId(opts.registry, filterRules, slot.itemId);
      if (filterAction) cell.dataset.filterAction = filterAction;
      else cell.removeAttribute("data-filter-action");
      const displayName = nameFor(slot.itemId);
      if (nameEl) nameEl.textContent = displayName;
      if (countEl) countEl.textContent = slot.count > 1 ? String(slot.count) : "";
      cell.setAttribute(
        "aria-label",
        opts.loc.t("inventory.slot.aria", { n: index + 1, name: displayName, count: slot.count }),
      );
      tooltips[index] = attachTooltip(
        cell,
        opts.loc.t("inventory.slot.tooltip", { name: displayName, count: slot.count }),
      );
    });
  }

  function focusCursor(): void {
    slotEls[ui.cursor]?.focus();
  }

  function onActivate(index: number): void {
    const result = select(ui, index);
    ui = result.state;
    if (result.kind === "moved") {
      applyChange(inventory.move(result.from, result.to));
    } else {
      renderSlots();
      focusCursor();
    }
  }

  function onKeyDown(e: KeyboardEvent, index: number): void {
    if (index !== ui.cursor) ui = { ...ui, cursor: index };
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        ui = moveCursor(ui, 1, 0, inventory.capacity, cols);
        renderSlots();
        focusCursor();
        return;
      case "ArrowLeft":
        e.preventDefault();
        ui = moveCursor(ui, -1, 0, inventory.capacity, cols);
        renderSlots();
        focusCursor();
        return;
      case "ArrowDown":
        e.preventDefault();
        ui = moveCursor(ui, 0, 1, inventory.capacity, cols);
        renderSlots();
        focusCursor();
        return;
      case "ArrowUp":
        e.preventDefault();
        ui = moveCursor(ui, 0, -1, inventory.capacity, cols);
        renderSlots();
        focusCursor();
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        onActivate(ui.cursor);
        return;
      case "Escape":
        if (ui.picked !== null) {
          e.preventDefault();
          ui = cancelPick(ui);
          renderSlots();
        }
        return;
      default:
        return;
    }
  }

  function onSplit(e: MouseEvent, index: number): void {
    e.preventDefault();
    const slot = inventory.slots[index];
    if (!slot || slot.count < 2) return;
    applyChange(inventory.split(index, splitCount(slot.count)));
  }

  function onQuickMove(index: number): void {
    if (hotbarSize <= 0) return;
    applyChange(quickMove(opts.registry, inventory, index, hotbarSize));
  }

  function onDragStart(e: DragEvent, index: number): void {
    const slot = inventory.slots[index];
    if (!slot) {
      e.preventDefault();
      return;
    }
    activeDrag = { gridId, index };
    e.dataTransfer?.setData("text/plain", `${gridId}:${index}`);
  }

  function onDrop(e: DragEvent, targetIndex: number): void {
    e.preventDefault();
    const drag = activeDrag;
    activeDrag = null;
    if (!drag) return;
    if (drag.gridId === gridId) {
      if (drag.index === targetIndex) return;
      applyChange(inventory.move(drag.index, targetIndex));
      return;
    }
    opts.onExternalDrop?.(drag.gridId, drag.index, targetIndex);
  }

  return {
    el,
    render(next: Inventory): void {
      inventory = next;
      if (ui.cursor >= inventory.capacity) ui = { ...ui, cursor: Math.max(0, inventory.capacity - 1) };
      renderSlots();
    },
    setFilterRules(rules: readonly FilterRule[]): void {
      filterRules = rules;
      renderSlots();
    },
    dispose(): void {
      tooltips.forEach((t) => t.dispose());
      el.remove();
    },
  };
}
