/**
 * Procedural item-icon spec (Phase E6.7) — pure classification/hash logic,
 * no DOM/canvas. Every registered item gets a distinct, DETERMINISTIC icon
 * (same id -> same spec, always) built from three cheap signals: a shape
 * keyed by the item's primary tag/kind, a color drawn from a small curated
 * set of already-contrast-verified theme tokens (see `ui/theme/tokens.ts`'s
 * doc-block ratios), and the item's initial letter as a glyph. This keeps
 * icons legible + distinct without any binary asset or per-item authoring —
 * a newly registered item gets a correct icon for free.
 *
 * `ItemIconElement.ts` (ui-layer, DOM-aware) turns a spec into an inline SVG
 * and caches the markup per item id.
 */

export type ItemIconKind =
  | "weapon"
  | "tool"
  | "gear"
  | "treasure"
  | "food"
  | "seed"
  | "light"
  | "metal"
  | "material"
  | "misc";

export type IconShape =
  | "blade" // weapon
  | "pick" // tool
  | "shield" // gear/armor
  | "gem" // treasure
  | "leaf" // food
  | "sprout" // seed/crop
  | "burst" // light
  | "bar" // metal/smeltable
  | "hex" // material/natural
  | "square"; // misc/crafted fallback

const KIND_SHAPE: Readonly<Record<ItemIconKind, IconShape>> = {
  weapon: "blade",
  tool: "pick",
  gear: "shield",
  treasure: "gem",
  food: "leaf",
  seed: "sprout",
  light: "burst",
  metal: "bar",
  material: "hex",
  misc: "square",
};

/** Priority-ordered tag -> kind classification. First match wins, so a
 *  weapon tagged both "tool" and "weapon" (iron-sword) reads as a weapon. */
export function classifyItemIconKind(tags: readonly string[]): ItemIconKind {
  if (tags.includes("weapon")) return "weapon";
  if (tags.includes("tool")) return "tool";
  if (tags.includes("gear") || tags.includes("armor")) return "gear";
  if (tags.includes("treasure")) return "treasure";
  if (tags.includes("food")) return "food";
  if (tags.includes("seed") || tags.includes("crop")) return "seed";
  if (tags.includes("light")) return "light";
  if (tags.includes("metal")) return "metal";
  if (tags.includes("material") || tags.includes("natural") || tags.includes("crafted")) {
    return "material";
  }
  return "misc";
}

export function iconShapeForKind(kind: ItemIconKind): IconShape {
  return KIND_SHAPE[kind];
}

/** A small curated palette of theme color tokens already contrast-verified
 *  against `--lw-bg-panel` (see tokens.ts) — icons never invent new colors. */
export const ICON_COLOR_TOKENS = [
  "accent",
  "success",
  "warning",
  "danger",
  "focus",
  "fgMuted",
] as const;
export type IconColorToken = (typeof ICON_COLOR_TOKENS)[number];

/** Deterministic 32-bit FNV-1a string hash — no `Math.random`, so the same
 *  id always maps to the same bucket across sessions/reloads/multiplayer peers. */
export function hashItemId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function colorTokenForItem(id: string): IconColorToken {
  const h = hashItemId(id);
  return ICON_COLOR_TOKENS[h % ICON_COLOR_TOKENS.length]!;
}

export interface ItemIconSpec {
  readonly kind: ItemIconKind;
  readonly shape: IconShape;
  readonly colorToken: IconColorToken;
  readonly glyphLetter: string;
}

export function itemIconSpec(
  itemId: string,
  displayName: string,
  tags: readonly string[],
): ItemIconSpec {
  const kind = classifyItemIconKind(tags);
  const trimmed = displayName.trim();
  return {
    kind,
    shape: iconShapeForKind(kind),
    colorToken: colorTokenForItem(itemId),
    glyphLetter: trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?",
  };
}
