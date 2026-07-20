/**
 * ContextMenu (Phase E8.4) — an accessible `role="menu"` action popup,
 * attached to a single anchor element (a slot cell, an item icon, etc.),
 * backed by the pure `domain/ui/ItemActions.ts` action list. Replaces the
 * ad-hoc split-only `contextmenu` handler in `InventoryGrid.ts`.
 *
 * Three ways in, one anchor:
 *  - mouse right-click (`contextmenu`) opens at the pointer.
 *  - keyboard `Shift+F10` (the platform-standard "open context menu" chord)
 *    opens anchored just under the focused anchor element.
 *  - touch long-press (~500ms, cancelled by >10px of movement or an early
 *    lift) opens at the touch point.
 *
 * Keyboard nav once open: ArrowUp/Down moves a roving-tabindex cursor
 * (wrapping), Home/End jump to the first/last item, Enter activates the
 * focused item, Escape closes. Selecting an item, Escape, or an
 * outside-pointerdown all close the menu and return focus to the anchor —
 * the menu never leaves focus stranded. A disabled action stays visible and
 * reachable (`aria-disabled`, per WAI-ARIA menu authoring practice) but does
 * nothing when activated. Static positioning + the shared `.laas-ui`
 * reduced-motion rule in `styles.ts` (E8.1) mean this needs no motion code of
 * its own to be reduced-motion-safe.
 *
 * `doc`-pure like `Tooltip.ts`/`WindowFrame.ts`: builds every node through
 * the anchor's owner document (or an explicit override for tests), so the
 * same menu renders under happy-dom and live.
 */

import type { ItemAction, ItemActionId } from "../../domain/ui/ItemActions";
import type { Localizer } from "../../application/i18n/Localizer";
import { injectStyles } from "../styles";

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export interface ContextMenuOptions {
  readonly doc?: Document;
  readonly actions: readonly ItemAction[];
  readonly loc: Localizer;
  readonly ariaLabel: string;
  onSelect(id: ItemActionId): void;
}

export interface ContextMenuHandle {
  readonly isOpen: boolean;
  dispose(): void;
}

export function attachContextMenu(anchor: HTMLElement, opts: ContextMenuOptions): ContextMenuHandle {
  const doc = opts.doc ?? anchor.ownerDocument;
  // Nothing to show (e.g. an empty slot): still suppress the native
  // right-click menu (matches the old handler's unconditional
  // `preventDefault`), but build no popup and never open.
  const hasActions = opts.actions.length > 0;

  let menu: HTMLElement | null = null;
  let itemEls: HTMLButtonElement[] = [];

  if (hasActions) {
    injectStyles(doc);

    menu = doc.createElement("div");
    menu.className = "laas-ui lw-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", opts.ariaLabel);
    menu.hidden = true;

    itemEls = opts.actions.map((action) => {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "lw-context-menu-item";
      btn.setAttribute("role", "menuitem");
      btn.tabIndex = -1;
      btn.textContent = opts.loc.t(action.labelKey);
      btn.setAttribute("aria-disabled", String(!action.enabled));
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        activate(action);
      });
      menu!.appendChild(btn);
      return btn;
    });

    menu.addEventListener("keydown", onMenuKeyDown);
    doc.body.appendChild(menu);
  }

  let open = false;
  let focusedIndex = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let touchStart: { x: number; y: number } | null = null;

  function position(el: HTMLElement, x: number, y: number): void {
    const view = doc.defaultView;
    const vw = view?.innerWidth ?? 1024;
    const vh = view?.innerHeight ?? 768;
    // offsetWidth/Height are 0 under happy-dom (no real layout) — the clamp
    // is then a no-op, which is fine for tests; a live layout clamps for real.
    const left = Math.min(Math.max(0, x), Math.max(0, vw - el.offsetWidth));
    const top = Math.min(Math.max(0, y), Math.max(0, vh - el.offsetHeight));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function setFocusedIndex(index: number): void {
    const wrapped = ((index % itemEls.length) + itemEls.length) % itemEls.length;
    itemEls[focusedIndex]?.setAttribute("tabindex", "-1");
    focusedIndex = wrapped;
    itemEls[focusedIndex]?.setAttribute("tabindex", "0");
    itemEls[focusedIndex]?.focus();
  }

  function openAt(x: number, y: number): void {
    if (!hasActions || !menu || open) return;
    open = true;
    menu.hidden = false;
    position(menu, x, y);
    const firstEnabled = opts.actions.findIndex((a) => a.enabled);
    focusedIndex = firstEnabled >= 0 ? firstEnabled : 0;
    itemEls.forEach((el, i) => el.setAttribute("tabindex", i === focusedIndex ? "0" : "-1"));
    itemEls[focusedIndex]?.focus();
    doc.addEventListener("pointerdown", onOutsidePointerDown, true);
  }

  function close(returnFocus: boolean): void {
    if (!open || !menu) return;
    open = false;
    menu.hidden = true;
    doc.removeEventListener("pointerdown", onOutsidePointerDown, true);
    if (returnFocus) anchor.focus();
  }

  function activate(action: ItemAction): void {
    if (!action.enabled) return;
    opts.onSelect(action.id);
    close(true);
  }

  function onMenuKeyDown(e: KeyboardEvent): void {
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex(focusedIndex + 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex(focusedIndex - 1);
        return;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        return;
      case "End":
        e.preventDefault();
        setFocusedIndex(itemEls.length - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        activate(opts.actions[focusedIndex]!);
        return;
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      default:
        return;
    }
  }

  function onOutsidePointerDown(e: Event): void {
    if (menu?.contains(e.target as Node)) return;
    close(true);
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    openAt(e.clientX, e.clientY);
  }

  function onAnchorKeyDown(e: KeyboardEvent): void {
    if (hasActions && e.key === "F10" && e.shiftKey) {
      e.preventDefault();
      const rect = anchor.getBoundingClientRect();
      openAt(rect.left, rect.bottom);
    }
  }

  function clearLongPress(): void {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    touchStart = null;
  }

  function onTouchStart(e: TouchEvent): void {
    if (!hasActions) return;
    const touch = e.touches[0];
    if (!touch) return;
    touchStart = { x: touch.clientX, y: touch.clientY };
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (touchStart) openAt(touchStart.x, touchStart.y);
    }, LONG_PRESS_MS);
  }

  function onTouchMove(e: TouchEvent): void {
    const touch = e.touches[0];
    if (!touch || !touchStart) return;
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) clearLongPress();
  }

  anchor.addEventListener("contextmenu", onContextMenu);
  anchor.addEventListener("keydown", onAnchorKeyDown);
  anchor.addEventListener("touchstart", onTouchStart as EventListener, { passive: true });
  anchor.addEventListener("touchmove", onTouchMove as EventListener, { passive: true });
  anchor.addEventListener("touchend", clearLongPress);
  anchor.addEventListener("touchcancel", clearLongPress);

  return {
    get isOpen() {
      return open;
    },
    dispose(): void {
      clearLongPress();
      close(false);
      anchor.removeEventListener("contextmenu", onContextMenu);
      anchor.removeEventListener("keydown", onAnchorKeyDown);
      anchor.removeEventListener("touchstart", onTouchStart as EventListener);
      anchor.removeEventListener("touchmove", onTouchMove as EventListener);
      anchor.removeEventListener("touchend", clearLongPress);
      anchor.removeEventListener("touchcancel", clearLongPress);
      menu?.remove();
    },
  };
}
