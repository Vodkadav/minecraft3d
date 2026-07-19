/**
 * Hotbar — 9 slots bound to the first 9 slots of the player's Inventory
 * (the existing domain model). Selection is the pure `domain/ui/HotbarSelection`
 * state: number keys 1-9 select directly, mouse wheel scrolls with wrap-around,
 * clicking a slot selects it too. No icon art exists yet, so slots render the
 * item's short display name — still legible, still keyboard-navigable
 * (each slot is a real, focusable button).
 */

import type { Inventory } from "../../domain/inventory/Inventory";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import { isOk } from "../../domain/Result";
import {
  HOTBAR_SIZE,
  initialHotbar,
  scrollHotbar,
  selectHotbarByDigit,
  selectHotbarSlot,
  type HotbarState,
} from "../../domain/ui/HotbarSelection";
import { injectStyles } from "../styles";

export interface HotbarOptions {
  readonly registry: ItemRegistry;
  readonly ariaLabel: string;
  readonly slotAriaLabel: (index: number) => string;
  readonly emptySlotLabel: string;
  onSelect?(index: number): void;
  /** Injectable for tests; defaults to the real window. */
  readonly target?: EventTarget;
  /** Off when the host page already owns digit keys 1-9 for something else
   *  (e.g. the terrain scene's camera bookmarks) — wheel/click selection
   *  still works. Defaults to true. */
  readonly enableDigitKeys?: boolean;
}

export interface HotbarHandle {
  readonly el: HTMLElement;
  render(inventory: Inventory): void;
  readonly selected: number;
  dispose(): void;
}

export function Hotbar(opts: HotbarOptions): HotbarHandle {
  const doc = document;
  injectStyles(doc);
  const target = opts.target ?? doc.defaultView ?? window;

  const el = doc.createElement("ul");
  el.className = "laas-ui lw-hotbar";
  el.setAttribute("role", "listbox");
  el.setAttribute("aria-label", opts.ariaLabel);

  const slotEls: HTMLLIElement[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const li = doc.createElement("li");
    li.className = "lw-hotbar-slot";
    li.setAttribute("role", "option");
    li.tabIndex = 0;
    const key = doc.createElement("span");
    key.className = "lw-hotbar-slot-key";
    key.textContent = String(i + 1);
    const count = doc.createElement("span");
    count.className = "lw-hotbar-slot-count";
    li.append(key, count);
    li.addEventListener("click", () => selectIndex(i));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectIndex(i);
      }
    });
    slotEls.push(li);
    el.appendChild(li);
  }

  let hotbar: HotbarState = initialHotbar();

  function applySelection(): void {
    slotEls.forEach((slotEl, i) => {
      slotEl.dataset.selected = String(i === hotbar.selected);
      slotEl.setAttribute("aria-selected", String(i === hotbar.selected));
    });
  }

  function selectIndex(index: number): void {
    hotbar = selectHotbarSlot(hotbar, index);
    applySelection();
    opts.onSelect?.(hotbar.selected);
  }

  function onKeyDown(ev: Event): void {
    const key = (ev as KeyboardEvent).key;
    const digit = Number(key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= HOTBAR_SIZE) {
      hotbar = selectHotbarByDigit(hotbar, digit);
      applySelection();
      opts.onSelect?.(hotbar.selected);
    }
  }
  function onWheel(ev: Event): void {
    const deltaY = (ev as WheelEvent).deltaY;
    hotbar = scrollHotbar(hotbar, deltaY);
    applySelection();
    opts.onSelect?.(hotbar.selected);
  }
  const digitKeysEnabled = opts.enableDigitKeys ?? true;
  if (digitKeysEnabled) target.addEventListener("keydown", onKeyDown);
  target.addEventListener("wheel", onWheel);

  applySelection();

  return {
    el,
    render(inventory: Inventory): void {
      const slots = inventory.slots.slice(0, HOTBAR_SIZE);
      slots.forEach((slot, i) => {
        const slotEl = slotEls[i];
        if (!slotEl) return;
        const key = slotEl.querySelector(".lw-hotbar-slot-key");
        const count = slotEl.querySelector(".lw-hotbar-slot-count");
        if (!slot) {
          slotEl.setAttribute("aria-label", opts.slotAriaLabel(i));
          slotEl.title = opts.emptySlotLabel;
          if (count) count.textContent = "";
          const nameEl = slotEl.querySelector(".lw-hotbar-slot-name");
          nameEl?.remove();
          return;
        }
        const def = opts.registry.get(slot.itemId);
        const displayName = isOk(def) ? def.value.displayName : slot.itemId;
        let nameEl = slotEl.querySelector<HTMLSpanElement>(".lw-hotbar-slot-name");
        if (!nameEl) {
          nameEl = doc.createElement("span");
          nameEl.className = "lw-hotbar-slot-name";
          slotEl.insertBefore(nameEl, key);
        }
        nameEl.textContent = displayName;
        slotEl.setAttribute("aria-label", opts.slotAriaLabel(i));
        slotEl.title = `${displayName} x${slot.count}`;
        if (count) count.textContent = slot.count > 1 ? String(slot.count) : "";
      });
      applySelection();
    },
    get selected() {
      return hotbar.selected;
    },
    dispose(): void {
      if (digitKeysEnabled) target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("wheel", onWheel);
      el.remove();
    },
  };
}
