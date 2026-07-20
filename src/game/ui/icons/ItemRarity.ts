/**
 * Item rarity derivation (Phase E8.2) — maps an item's progression `tier`
 * (the number a recipe gates against, `domain/items/ItemDefinition`) onto the
 * five-step visual rarity scale from the E8.0 contract (`ui/theme/tokens.ts`).
 *
 * Diggy World items carry no explicit rarity field yet, so `tier` is the
 * honest proxy: a tier-0 gathered material reads common, a tier-4 capstone
 * reads legendary. This is the single source every rarity-keyed icon/tooltip
 * uses, so a real per-item rarity field (a future content pass) only has to
 * replace this one function. Presentation-layer by nature (it interprets a
 * domain number as a look), so it lives here, not in `domain/**`.
 */

import { RARITY_TIERS, type RarityTier } from "../theme/tokens";

/** tier 0 -> common, 1 -> uncommon, 2 -> rare, 3 -> epic, >=4 -> legendary.
 *  Negative/NaN tiers clamp to common. */
export function rarityTierForItemTier(tier: number): RarityTier {
  if (!Number.isFinite(tier) || tier <= 0) return RARITY_TIERS[0];
  const idx = Math.min(Math.floor(tier), RARITY_TIERS.length - 1);
  return RARITY_TIERS[idx]!;
}
