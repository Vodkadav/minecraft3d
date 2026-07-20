/**
 * Item slot overlay badges (Phase E8.2) — small corner markers layered over an
 * item slot to signal state at a glance: "equipped" (currently worn/held) and
 * "new" (unseen since last acquired). Distinct SHAPE per kind (check vs. spark)
 * so the signal survives color-blindness, per the shape-not-color-only doctrine.
 *
 * Unlike the decorative icon/emblem, a badge carries real information, so it is
 * NOT aria-hidden: it takes its accessible label as text (the caller passes
 * `loc.t(...)`, exactly like `Keyhint`), keeping this module i18n-agnostic and
 * doc-pure. Quantity is already rendered by the slot's own count element, so it
 * is intentionally not a badge kind here.
 */

export const ITEM_BADGE_KINDS = ["equipped", "new"] as const;
export type ItemBadgeKind = (typeof ITEM_BADGE_KINDS)[number];

const BADGE_GLYPH: Readonly<Record<ItemBadgeKind, string>> = {
  // Check mark.
  equipped: `<path d="M4 12 L9 18 L20 5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Four-point spark.
  new: `<path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="currentColor"/>`,
};

export function createItemBadgeEl(
  doc: Document,
  kind: ItemBadgeKind,
  ariaLabel: string,
): HTMLSpanElement {
  const el = doc.createElement("span");
  el.className = "lw-item-badge";
  el.dataset.badge = kind;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", ariaLabel);
  el.innerHTML = `<svg viewBox="0 0 24 24" class="lw-item-badge-svg" focusable="false">${BADGE_GLYPH[kind]}</svg>`;
  return el;
}
