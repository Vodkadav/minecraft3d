/**
 * Pure item-card tooltip model (Phase E8.3, ADR 0005 #3) — turns an item id +
 * registry lookup (+ a translate function) into a renderer-free "card": a
 * localized name, rarity tier, category, stat/affix rows, and an optional
 * stack quantity/keyhints. `ui/components/RichTooltip.ts` is the only
 * consumer that turns this into DOM; this module never touches the DOM.
 *
 * Rarity: `ItemDefinition` carries no rarity field yet (E9's itemization wave
 * adds one) — every item defaults to "common" until then; callers may
 * override via `rarityTier`. Recorded as a standing deferral in
 * docs/UX_PLAN.md.
 *
 * Category classification mirrors `ui/icons/ItemIconSpec.ts`'s
 * `classifyItemIconKind` (identical tag-priority order) but is
 * re-implemented locally rather than imported: `domain/**` may not depend on
 * `ui/**` (dependency-cruiser's `game-domain-is-pure` rule), so the two pure
 * classifiers stay in lockstep by convention, not a shared import. If either
 * changes, update both.
 */

import { ok, type Result } from "../Result";
import type { ItemError, ItemRegistry } from "../items/ItemRegistry";

/** Ordered rarity tiers, common -> legendary — mirrors `ui/theme/tokens.ts`'s
 *  `RARITY_TIERS` (the CSS-var-backed source of truth for rendering). Domain
 *  purity forbids importing that module directly, so the tier list is
 *  duplicated here; both are the same 5 string literals by contract. */
export const RARITY_TIERS = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type RarityTier = (typeof RARITY_TIERS)[number];

export const ITEM_CATEGORIES = [
  "weapon",
  "tool",
  "gear",
  "treasure",
  "food",
  "seed",
  "light",
  "metal",
  "material",
  "misc",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

function classifyCategory(tags: readonly string[]): ItemCategory {
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

export interface TooltipRow {
  readonly label: string;
  readonly value: string;
}

export interface TooltipModel {
  readonly itemId: string;
  readonly name: string;
  readonly rarityTier: RarityTier;
  readonly category: ItemCategory;
  /** Passed through for the renderer's icon lookup (`ItemIconSpec`/`createItemIconEl`). */
  readonly tags: readonly string[];
  /** Current stack count, when the card renders for a specific inventory slot. */
  readonly quantity?: number;
  readonly rows: readonly TooltipRow[];
  /** Pre-localized interaction hints (e.g. "Right-click to split"); the
   *  caller decides which apply to its context. */
  readonly keyhints?: readonly string[];
}

/** Structural translate function — matches `Localizer.t`'s call shape
 *  without importing the application-layer class (domain purity). */
export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface BuildTooltipModelOptions {
  readonly itemId: string;
  readonly registry: ItemRegistry;
  readonly t: Translate;
  readonly quantity?: number;
  /** Rarity override — items carry no rarity field yet; defaults to "common". */
  readonly rarityTier?: RarityTier;
  readonly keyhints?: readonly string[];
}

export function buildTooltipModel(opts: BuildTooltipModelOptions): Result<TooltipModel, ItemError> {
  const defResult = opts.registry.get(opts.itemId);
  if (!defResult.ok) return defResult;
  const def = defResult.value;

  const nameKey = `item.${opts.itemId}.name`;
  const localizedName = opts.t(nameKey);
  const name = localizedName !== nameKey ? localizedName : def.displayName;

  const category = classifyCategory(def.tags);

  const rows: TooltipRow[] = [
    { label: opts.t("tooltip.row.category"), value: opts.t(`tooltip.category.${category}`) },
  ];
  if (def.tier > 0) {
    rows.push({ label: opts.t("tooltip.row.tier"), value: String(def.tier) });
  }
  if (def.food) {
    rows.push({ label: opts.t("tooltip.row.hunger"), value: `+${def.food.hungerRestore}` });
    if (def.food.healthRestore > 0) {
      rows.push({ label: opts.t("tooltip.row.health"), value: `+${def.food.healthRestore}` });
    }
  }
  if (def.combat) {
    rows.push({ label: opts.t("tooltip.row.damage"), value: String(def.combat.damage) });
    rows.push({ label: opts.t("tooltip.row.attackSpeed"), value: String(def.combat.attackSpeed) });
    rows.push({
      label: opts.t("tooltip.row.damageType"),
      value: opts.t(`tooltip.damageType.${def.combat.damageType}`),
    });
    if (def.combat.reach !== undefined) {
      rows.push({ label: opts.t("tooltip.row.reach"), value: String(def.combat.reach) });
    }
  }

  return ok({
    itemId: opts.itemId,
    name,
    rarityTier: opts.rarityTier ?? "common",
    category,
    tags: def.tags,
    quantity: opts.quantity,
    rows,
    keyhints: opts.keyhints,
  });
}
