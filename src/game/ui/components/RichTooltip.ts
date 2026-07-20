/**
 * RichTooltip (Phase E8.3, ADR 0005 #3) — the structured item-card tooltip
 * that replaces single-line `Tooltip.ts` hovers for items specifically
 * (`Tooltip.ts` stays for plain one-line hints like buttons). Renders a
 * `domain/ui/TooltipModel.ts` card: icon, rarity-colored name (+ stack
 * quantity badge), stat/affix rows, and optional keyhints.
 *
 * Reachable three ways, matching the existing `Tooltip.ts` hover/focus
 * contract plus touch: mouse hover (mouseenter/mouseleave), keyboard focus
 * (focus/blur — so it's reachable without a mouse), and a touch long-press
 * (~500ms hold, cancelled by a subsequent scroll/drag-sized move). Dismisses
 * on blur, mouseleave, Escape (document-wide, so it closes regardless of
 * which trigger opened it), or a tap outside the anchor. `role="tooltip"`
 * linked to the anchor via `aria-describedby`, exactly like `Tooltip.ts`.
 *
 * `doc`-pure: builds every node through the passed document (defaults to the
 * anchor's own document), so it renders identically under happy-dom and live.
 * No i18n import here — every string in the model is already localized by
 * `buildTooltipModel`'s caller; this component is presentation-only.
 * Reduced-motion-safe by construction: the card carries the `laas-ui` class,
 * so the global `[data-reduced-motion="true"] .laas-ui *` rule
 * (`ui/styles.ts`) already suppresses any transition/animation on it.
 */

import type { TooltipModel } from "../../domain/ui/TooltipModel";
import { createItemIconEl } from "../icons/ItemIconElement";
import { injectStyles } from "../styles";

let seq = 0;

const DEFAULT_LONG_PRESS_MS = 500;
const TOUCH_MOVE_CANCEL_PX = 10;
const VIEWPORT_MARGIN = 4;
const ANCHOR_GAP = 8;
/** Layout fallback for environments without real box metrics (e.g. happy-dom,
 *  which always reports 0 offsetWidth/offsetHeight) — keeps clamping math
 *  deterministic under test as well as live. */
const FALLBACK_CARD_WIDTH = 240;
const FALLBACK_CARD_HEIGHT = 120;

export interface RichTooltipOptions {
  readonly doc?: Document;
  readonly anchor: HTMLElement;
  readonly model: TooltipModel;
  /** Touch-hold duration before the card opens; defaults to 500ms. */
  readonly longPressMs?: number;
}

export interface RichTooltipHandle {
  /** The `role="tooltip"` card element (hidden until shown). */
  readonly el: HTMLElement;
  /** Live content update (e.g. a slot's stack count changed) — no re-attach. */
  update(model: TooltipModel): void;
  dispose(): void;
}

export function RichTooltip(opts: RichTooltipOptions): RichTooltipHandle {
  const doc = opts.doc ?? opts.anchor.ownerDocument ?? document;
  injectStyles(doc);

  const id = `lw-rich-tooltip-${++seq}`;
  const anchor = opts.anchor;

  const card = doc.createElement("div");
  card.id = id;
  card.className = "laas-ui lw-rich-tooltip";
  card.setAttribute("role", "tooltip");
  card.hidden = true;

  const header = doc.createElement("div");
  header.className = "lw-rich-tooltip-header";
  const iconSlot = doc.createElement("span");
  iconSlot.className = "lw-rich-tooltip-icon-wrap";
  const nameWrap = doc.createElement("div");
  nameWrap.className = "lw-rich-tooltip-name-wrap";
  const nameEl = doc.createElement("span");
  nameEl.className = "lw-rich-tooltip-name";
  const qtyEl = doc.createElement("span");
  qtyEl.className = "lw-rich-tooltip-qty";
  nameWrap.append(nameEl, qtyEl);
  header.append(iconSlot, nameWrap);

  const rowsEl = doc.createElement("dl");
  rowsEl.className = "lw-rich-tooltip-rows";

  const hintsEl = doc.createElement("div");
  hintsEl.className = "lw-rich-tooltip-keyhints";

  card.append(header, rowsEl, hintsEl);

  function renderModel(model: TooltipModel): void {
    card.dataset.rarity = model.rarityTier;

    iconSlot.replaceChildren(createItemIconEl(doc, model.itemId, model.name, model.tags));
    nameEl.textContent = model.name;

    if (model.quantity !== undefined && model.quantity > 1) {
      qtyEl.textContent = `x${model.quantity}`;
      qtyEl.hidden = false;
    } else {
      qtyEl.textContent = "";
      qtyEl.hidden = true;
    }

    rowsEl.replaceChildren();
    for (const row of model.rows) {
      const dt = doc.createElement("dt");
      dt.textContent = row.label;
      const dd = doc.createElement("dd");
      dd.textContent = row.value;
      rowsEl.append(dt, dd);
    }
    rowsEl.hidden = model.rows.length === 0;

    hintsEl.replaceChildren();
    if (model.keyhints && model.keyhints.length > 0) {
      for (const hint of model.keyhints) {
        const span = doc.createElement("span");
        span.className = "lw-rich-tooltip-hint";
        span.textContent = hint;
        hintsEl.append(span);
      }
      hintsEl.hidden = false;
    } else {
      hintsEl.hidden = true;
    }
  }
  renderModel(opts.model);

  doc.body.appendChild(card);
  anchor.setAttribute("aria-describedby", id);

  function position(): void {
    const view = doc.defaultView;
    const vw = view?.innerWidth ?? 1024;
    const vh = view?.innerHeight ?? 768;
    const rect = anchor.getBoundingClientRect();
    const cardW = card.offsetWidth || FALLBACK_CARD_WIDTH;
    const cardH = card.offsetHeight || FALLBACK_CARD_HEIGHT;

    let left = rect.left;
    let top = rect.top - cardH - ANCHOR_GAP;
    if (top < VIEWPORT_MARGIN) top = rect.bottom + ANCHOR_GAP; // flip below when there's no room above

    const maxLeft = Math.max(VIEWPORT_MARGIN, vw - cardW - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, vh - cardH - VIEWPORT_MARGIN);
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft);
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), maxTop);

    card.style.position = "fixed";
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  let open = false;
  function show(): void {
    if (open) return;
    open = true;
    card.hidden = false;
    position();
  }
  function hide(): void {
    if (!open) return;
    open = false;
    card.hidden = true;
  }

  const onMouseEnter = (): void => show();
  const onMouseLeave = (): void => hide();
  const onFocus = (): void => show();
  const onBlur = (): void => hide();
  const onDocumentKeyDown = (e: Event): void => {
    if (open && (e as KeyboardEvent).key === "Escape") hide();
  };
  const onDocumentTouchStart = (e: Event): void => {
    if (open && !anchor.contains(e.target as Node)) hide();
  };

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let touchOrigin: { x: number; y: number } | null = null;
  const longPressMs = opts.longPressMs ?? DEFAULT_LONG_PRESS_MS;

  function clearPressTimer(): void {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }
  const onTouchStart = (e: Event): void => {
    const touch = (e as TouchEvent).touches[0];
    if (!touch) return;
    touchOrigin = { x: touch.clientX, y: touch.clientY };
    clearPressTimer();
    pressTimer = setTimeout(() => {
      pressTimer = null;
      show();
    }, longPressMs);
  };
  const onTouchMove = (e: Event): void => {
    const touch = (e as TouchEvent).touches[0];
    if (!touch || !touchOrigin) return;
    const dx = touch.clientX - touchOrigin.x;
    const dy = touch.clientY - touchOrigin.y;
    if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL_PX) clearPressTimer();
  };
  const onTouchEnd = (): void => {
    clearPressTimer();
    touchOrigin = null;
  };

  anchor.addEventListener("mouseenter", onMouseEnter);
  anchor.addEventListener("mouseleave", onMouseLeave);
  anchor.addEventListener("focus", onFocus);
  anchor.addEventListener("blur", onBlur);
  anchor.addEventListener("touchstart", onTouchStart, { passive: true });
  anchor.addEventListener("touchmove", onTouchMove, { passive: true });
  anchor.addEventListener("touchend", onTouchEnd);
  anchor.addEventListener("touchcancel", onTouchEnd);
  doc.addEventListener("keydown", onDocumentKeyDown);
  doc.addEventListener("touchstart", onDocumentTouchStart);

  return {
    el: card,
    update(next: TooltipModel): void {
      renderModel(next);
      if (open) position();
    },
    dispose(): void {
      clearPressTimer();
      anchor.removeAttribute("aria-describedby");
      anchor.removeEventListener("mouseenter", onMouseEnter);
      anchor.removeEventListener("mouseleave", onMouseLeave);
      anchor.removeEventListener("focus", onFocus);
      anchor.removeEventListener("blur", onBlur);
      anchor.removeEventListener("touchstart", onTouchStart);
      anchor.removeEventListener("touchmove", onTouchMove);
      anchor.removeEventListener("touchend", onTouchEnd);
      anchor.removeEventListener("touchcancel", onTouchEnd);
      doc.removeEventListener("keydown", onDocumentKeyDown);
      doc.removeEventListener("touchstart", onDocumentTouchStart);
      card.remove();
    },
  };
}
