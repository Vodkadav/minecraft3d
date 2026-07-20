/**
 * Panel header emblem (Phase E6.7) — a small, consistent flourish for HUD
 * panel headers (character/bank/map/settings). Purely decorative
 * (`aria-hidden`): the panel's real accessible name stays on the overlay's
 * `aria-label`/heading text, unchanged. Procedural inline SVG, themed via
 * the same `var(--lw-*)` tokens every other icon in this module uses.
 */

export type PanelEmblemKind = "character" | "bank" | "map" | "settings";

const EMBLEM_PATH: Readonly<Record<PanelEmblemKind, string>> = {
  // Stylized head-and-shoulders badge.
  character: "M12 3 A4 4 0 1 1 12 11 A4 4 0 1 1 12 3 Z M4 21 C4 15 8 13 12 13 C16 13 20 15 20 21",
  // Coin stack.
  bank: "M12 2 A9 4 0 1 1 12 10 A9 4 0 1 1 12 2 Z M3 6 V13 A9 4 0 0 0 21 13 V6 M3 11 V18 A9 4 0 0 0 21 18 V11",
  // Compass.
  map: "M12 2 A10 10 0 1 1 12 22 A10 10 0 1 1 12 2 Z M15.5 8.5 L13 13 L8.5 15.5 L11 11 Z",
  // Gear.
  settings:
    "M12 8 A4 4 0 1 1 12 16 A4 4 0 1 1 12 8 Z M12 1 V4 M12 20 V23 M1 12 H4 M20 12 H23 " +
    "M4.2 4.2 L6.3 6.3 M17.7 17.7 L19.8 19.8 M19.8 4.2 L17.7 6.3 M6.3 17.7 L4.2 19.8",
};

export function createPanelEmblemEl(doc: Document, kind: PanelEmblemKind): HTMLSpanElement {
  const wrap = doc.createElement("span");
  wrap.className = "lw-panel-emblem";
  wrap.dataset.kind = kind;
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML =
    `<svg viewBox="0 0 24 24" class="lw-panel-emblem-svg" focusable="false">` +
    `<path d="${EMBLEM_PATH[kind]}" fill="none" stroke="var(--lw-accent)" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return wrap;
}
