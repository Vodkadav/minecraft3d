/**
 * E7.8 bonus loot pools, keyed by creature species id — a new, separate table
 * so `starterCreatures.ts`'s array (whose index is the SpawnField per-species
 * hash salt) never has to be reordered or have an entry inserted mid-array to
 * carry this data. A species with no entry here keeps its exact pre-E7.8 flat
 * loot (`Combat.lootFor`'s backward-compat path); a species listed here gets
 * one extra deterministic bonus drop on top of its unchanged base loot,
 * rarity-shifted by `LootTable.dangerScore` (difficulty + creature tier +
 * night). Cozy tone: fangs, gems, and a golden acorn — cheerful trinkets, no
 * grim drops.
 */

import type { LootPool } from "../loot/LootTable";

export const CREATURE_LOOT_POOLS: Readonly<Record<string, LootPool>> = {
  wolf: [
    { itemId: "hide", min: 1, max: 1, tier: "common" },
    { itemId: "wolf-fang", min: 1, max: 2, tier: "rare" },
    { itemId: "sparkle-gem", min: 1, max: 1, tier: "legendary" },
  ],
  boar: [
    { itemId: "meat", min: 1, max: 1, tier: "common" },
    { itemId: "sparkle-gem", min: 1, max: 1, tier: "rare" },
  ],
  badger: [
    { itemId: "hide", min: 1, max: 1, tier: "common" },
    { itemId: "sparkle-gem", min: 1, max: 1, tier: "rare" },
  ],
  bear: [
    { itemId: "bear-claw", min: 1, max: 1, tier: "common" },
    { itemId: "sparkle-gem", min: 1, max: 2, tier: "rare" },
    { itemId: "golden-acorn", min: 1, max: 1, tier: "legendary" },
  ],
};
