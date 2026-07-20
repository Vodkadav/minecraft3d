/**
 * Panel header emblem (Phase E6.7) — a small, consistent flourish for HUD
 * panel headers (character/bank/map/settings). Purely decorative
 * (`aria-hidden`): the panel's real accessible name stays on the overlay's
 * `aria-label`/heading text, unchanged. Procedural inline SVG, themed via
 * the same `var(--lw-*)` tokens every other icon in this module uses.
 */

export const PANEL_EMBLEM_KINDS = [
  "character",
  "bank",
  "map",
  "settings",
  "inventory",
  "chest",
  "campfire",
  "trade",
  "research",
  "party",
] as const;
export type PanelEmblemKind = (typeof PANEL_EMBLEM_KINDS)[number];

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
  // Backpack.
  inventory: "M8 6 V4 A4 4 0 0 1 16 4 V6 M5 6 H19 V21 H5 Z M9 6 V13 H15 V6 M9 13 V15 H15 V13",
  // Treasure chest.
  chest: "M4 9 L6 5 H18 L20 9 V20 H4 Z M4 9 H20 M12 9 V13 M10 11 H14",
  // Campfire (flame over crossed logs).
  campfire: "M12 3 C15 7 15 9 13 11 C14 8 12 8 12 10 C11 8 9 9 11 11 C9 9 9 7 12 3 M4 20 L20 16 M4 16 L20 20",
  // Two circulating trade arrows.
  trade: "M5 9 H16 L13 6 M19 15 H8 L11 18 M5 9 A7 7 0 0 1 16 5 M19 15 A7 7 0 0 1 8 19",
  // Research flask.
  research: "M9 2 H15 M10 2 V9 L5 19 A2 2 0 0 0 7 22 H17 A2 2 0 0 0 19 19 L14 9 V2 M7.5 15 H16.5",
  // Party (two figures).
  party:
    "M8 6 A2.5 2.5 0 1 1 8 11 A2.5 2.5 0 1 1 8 6 M3 21 C3 16 5.5 14 8 14 C10.5 14 13 16 13 21 " +
    "M16 7 A2.2 2.2 0 1 1 16 11.4 A2.2 2.2 0 1 1 16 7 M13.5 14.4 C15 13.6 16.5 13.8 18 14.6 C20 15.6 21 17.8 21 21",
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
