/**
 * Item icon DOM renderer (Phase E6.7) — turns an `ItemIconSpec` into an
 * inline `<svg>` fragment. SVG (not canvas) so fill colors reference the
 * live theme custom properties (`var(--lw-accent)` etc.) and stay correct
 * under settings changes (high-contrast, future palette edits) without
 * re-rendering a baked bitmap. Markup is generated once per item id and
 * cached (module-scope Map) — callers get cheap `cloneNode`-free reuse via
 * `innerHTML`, which is what every call site here already does for slot
 * cells (no persistent SVG DOM identity needed, so string caching is the
 * cheapest correct option).
 *
 * Icons are always `aria-hidden` — they decorate a slot that already carries
 * a real accessible name (aria-label/tooltip on the containing element); see
 * InventoryGrid.ts/Hotbar.ts/Toast.ts call sites.
 */

import { itemIconSpec, type IconColorToken, type IconShape, type ItemIconSpec } from "./ItemIconSpec";

const COLOR_VAR: Readonly<Record<IconColorToken, string>> = {
  accent: "var(--lw-accent)",
  success: "var(--lw-success)",
  warning: "var(--lw-warning)",
  danger: "var(--lw-danger)",
  focus: "var(--lw-focus)",
  fgMuted: "var(--lw-fg-muted)",
};

/** Shape silhouettes on a 24x24 viewBox — simple, legible at 32-40px. */
const SHAPE_PATH: Readonly<Record<IconShape, string>> = {
  blade: "M12 1 L14.5 9 L20 12 L14.5 15 L12 23 L9.5 15 L4 12 L9.5 9 Z",
  pick: "M4 10 Q12 2 20 10 L15 12 L12 22 L9 12 Z",
  shield: "M12 1 L21 5 V11 C21 17 17 21 12 23 C7 21 3 17 3 11 V5 Z",
  gem: "M4 9 L9 3 H15 L20 9 L12 22 Z",
  leaf: "M4 20 C4 10 10 3 20 3 C20 13 13 20 4 20 Z",
  sprout: "M12 22 V13 M12 13 C12 7 7 6 5 6 C5 11 9 13 12 13 M12 13 C12 8 16 6 19 6 C19 10 16 13 12 13",
  burst: "M12 1 L14 9 L22 12 L14 15 L12 23 L10 15 L2 12 L10 9 Z",
  bar: "M3 8 H21 V16 H3 Z M3 8 L6 5 H18 L21 8 M3 16 L6 19 H18 L21 16",
  hex: "M12 1 L21 6.5 V17.5 L12 23 L3 17.5 V6.5 Z",
  square: "M3 3 H21 V21 H3 Z",
};

const markupCache = new Map<string, string>();

function buildSvgMarkup(spec: ItemIconSpec): string {
  const color = COLOR_VAR[spec.colorToken];
  const path =
    spec.shape === "sprout" || spec.shape === "bar"
      ? `<path d="${SHAPE_PATH[spec.shape]}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${SHAPE_PATH[spec.shape]}" fill="${color}" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>`;
  // The glyph letter is a small readability aid layered over the shape —
  // never the sole distinguishing signal (shape + color already differ).
  return (
    `<svg viewBox="0 0 24 24" class="lw-item-icon-svg" focusable="false">` +
    path +
    `<text x="12" y="16" text-anchor="middle" font-size="9" font-weight="700" ` +
    `fill="rgba(0,0,0,0.65)" style="paint-order:stroke;stroke:rgba(255,255,255,0.35);stroke-width:2px">` +
    spec.glyphLetter +
    `</text></svg>`
  );
}

/** Cached SVG markup for a registered item; same id -> identical string. */
export function getItemIconMarkup(itemId: string, displayName: string, tags: readonly string[]): string {
  const cached = markupCache.get(itemId);
  if (cached) return cached;
  const markup = buildSvgMarkup(itemIconSpec(itemId, displayName, tags));
  markupCache.set(itemId, markup);
  return markup;
}

/** Builds a ready-to-append `<span class="lw-item-icon">` wrapper, aria-hidden. */
export function createItemIconEl(
  doc: Document,
  itemId: string,
  displayName: string,
  tags: readonly string[],
): HTMLSpanElement {
  const wrap = doc.createElement("span");
  wrap.className = "lw-item-icon";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = getItemIconMarkup(itemId, displayName, tags);
  return wrap;
}

/** Test/dev seam — clears the module-scope cache (icon specs are pure so
 *  this is never needed at runtime, only for isolated cache-behavior tests). */
export function __clearItemIconCache(): void {
  markupCache.clear();
}
