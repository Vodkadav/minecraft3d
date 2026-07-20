/**
 * Party / faction crest generator (Phase E8.2) — a deterministic procedural
 * heraldic badge from a seed string (a party id, a faction name), so every
 * group gets a stable, recognizable emblem with zero authored art. Same seed
 * -> identical crest across sessions and peers (FNV-1a, no `Math.random`),
 * matching the seeded-icon convention in `ItemIconSpec.ts`.
 *
 * A crest = a shield in a seeded theme-token field color + one seeded
 * heraldic "charge" (chevron/cross/star/roundel/bend) in the foreground. All
 * colors are `var(--lw-*)` tokens (theme-reactive), never invented. Purely
 * decorative (`aria-hidden`): the party/faction's real name lives in adjacent
 * text, so the crest carries no standalone information.
 */

import { hashItemId } from "./ItemIconSpec";

const FIELD_TOKENS = [
  "var(--lw-accent)",
  "var(--lw-success)",
  "var(--lw-warning)",
  "var(--lw-danger)",
  "var(--lw-focus)",
  "var(--lw-rarity-rare-frame)",
  "var(--lw-rarity-epic-frame)",
  "var(--lw-rarity-uncommon-frame)",
] as const;

export const CREST_CHARGES = ["chevron", "cross", "star", "roundel", "bend"] as const;
export type CrestCharge = (typeof CREST_CHARGES)[number];

const SHIELD_PATH = "M12 1 L21 4 V11 C21 17 17 21 12 23 C7 21 3 17 3 11 V4 Z";

const CHARGE_PATH: Readonly<Record<CrestCharge, string>> = {
  chevron: "M6 15 L12 9 L18 15",
  cross: "M12 5 V18 M6 11 H18",
  star: "M12 5 L13.6 10 L18.8 10 L14.6 13.2 L16.2 18.2 L12 15 L7.8 18.2 L9.4 13.2 L5.2 10 L10.4 10 Z",
  roundel: "M12 11.5 A3.5 3.5 0 1 1 12 11.4 Z",
  bend: "M6 17 L17 6",
};

export interface Crest {
  readonly field: string;
  readonly charge: CrestCharge;
}

/** Pure: derive the deterministic crest (field color + charge) for a seed. */
export function crestForSeed(seed: string): Crest {
  const h = hashItemId(seed);
  return {
    field: FIELD_TOKENS[h % FIELD_TOKENS.length]!,
    // A second, decorrelated bucket for the charge so field and charge vary
    // independently (shift the hash before the second modulo).
    charge: CREST_CHARGES[(h >>> 8) % CREST_CHARGES.length]!,
  };
}

export function crestMarkup(seed: string): string {
  const { field, charge } = crestForSeed(seed);
  const filledCharge = charge === "roundel" || charge === "star";
  const chargeEl = filledCharge
    ? `<path d="${CHARGE_PATH[charge]}" fill="var(--lw-fg)" stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>`
    : `<path d="${CHARGE_PATH[charge]}" fill="none" stroke="var(--lw-fg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return (
    `<svg viewBox="0 0 24 24" class="lw-crest-svg" focusable="false">` +
    `<path d="${SHIELD_PATH}" fill="${field}" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>` +
    chargeEl +
    `</svg>`
  );
}

/** Ready-to-append `<span class="lw-crest">`, aria-hidden (name lives adjacent). */
export function createCrestEl(doc: Document, seed: string): HTMLSpanElement {
  const wrap = doc.createElement("span");
  wrap.className = "lw-crest";
  wrap.dataset.seed = seed;
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = crestMarkup(seed);
  return wrap;
}
