/**
 * A minimal starter recipe graph over {@link STARTER_ITEMS}: a short tier-0 wood
 * chain plus a tier-1 smelt + tool branch, enough to exercise gated progression.
 */

import type { Recipe } from "./Crafting";

export const STARTER_RECIPES: readonly Recipe[] = [
  {
    id: "planks",
    ingredients: [{ itemId: "wood", count: 1 }],
    output: { itemId: "plank", count: 4 },
    unlockTier: 0,
  },
  {
    id: "sticks",
    ingredients: [{ itemId: "plank", count: 2 }],
    output: { itemId: "stick", count: 4 },
    unlockTier: 0,
  },
  {
    id: "ingot",
    ingredients: [{ itemId: "ore", count: 1 }],
    output: { itemId: "ingot", count: 1 },
    unlockTier: 1,
  },
  {
    id: "pickaxe",
    ingredients: [
      { itemId: "ingot", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "pickaxe", count: 1 },
    unlockTier: 1,
  },

  // ---- Workstream 7.1 expansion (wood -> stone -> metal -> refined) ----
  // wood / tier0
  {
    id: "charcoal",
    ingredients: [{ itemId: "wood", count: 2 }],
    output: { itemId: "charcoal", count: 1 },
    unlockTier: 0,
  },
  {
    id: "rope",
    ingredients: [{ itemId: "fiber", count: 3 }],
    output: { itemId: "rope", count: 1 },
    unlockTier: 0,
  },
  {
    id: "cloth",
    ingredients: [{ itemId: "wool", count: 2 }],
    output: { itemId: "cloth", count: 2 },
    unlockTier: 0,
  },
  {
    id: "torch",
    ingredients: [
      { itemId: "stick", count: 1 },
      { itemId: "charcoal", count: 1 },
    ],
    output: { itemId: "torch", count: 2 },
    unlockTier: 0,
  },
  // cooking (Workstream 8.4) — proximity-gated to a campfire, not tier-gated
  {
    id: "cook-meat",
    ingredients: [{ itemId: "meat", count: 1 }],
    output: { itemId: "cooked-meat", count: 1 },
    unlockTier: 0,
    station: "campfire",
    cookDurationS: 12,
  },
  {
    id: "cook-fish",
    ingredients: [{ itemId: "fish", count: 1 }],
    output: { itemId: "cooked-fish", count: 1 },
    unlockTier: 0,
    station: "campfire",
    cookDurationS: 8,
  },
  {
    id: "bake-bread",
    ingredients: [{ itemId: "wheat", count: 2 }],
    output: { itemId: "bread", count: 1 },
    unlockTier: 0,
    station: "campfire",
    cookDurationS: 10,
  },
  {
    id: "bake-potato",
    ingredients: [{ itemId: "potato", count: 1 }],
    output: { itemId: "baked-potato", count: 1 },
    unlockTier: 0,
    station: "campfire",
    cookDurationS: 9,
  },

  // stone / tier1
  {
    id: "stone-brick",
    ingredients: [{ itemId: "stone", count: 2 }],
    output: { itemId: "stone-brick", count: 1 },
    unlockTier: 1,
  },
  {
    id: "stone-axe",
    ingredients: [
      { itemId: "stone", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "stone-axe", count: 1 },
    unlockTier: 1,
    station: "workbench",
  },
  {
    id: "stone-pickaxe",
    ingredients: [
      { itemId: "stone", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "stone-pickaxe", count: 1 },
    unlockTier: 1,
    station: "workbench",
  },

  // metal / tier2
  {
    id: "gold-ingot",
    ingredients: [{ itemId: "gold-ore", count: 1 }],
    output: { itemId: "gold-ingot", count: 1 },
    unlockTier: 2,
  },
  {
    id: "copper-ingot",
    ingredients: [{ itemId: "copper-ore", count: 1 }],
    output: { itemId: "copper-ingot", count: 1 },
    unlockTier: 2,
  },
  {
    id: "nails",
    ingredients: [{ itemId: "ingot", count: 1 }],
    output: { itemId: "nails", count: 8 },
    unlockTier: 2,
  },
  {
    id: "iron-sword",
    ingredients: [
      { itemId: "ingot", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "iron-sword", count: 1 },
    unlockTier: 2,
    station: "workbench",
  },
  {
    id: "iron-axe",
    ingredients: [
      { itemId: "ingot", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "iron-axe", count: 1 },
    unlockTier: 2,
    station: "workbench",
  },
  {
    id: "iron-hoe",
    ingredients: [
      { itemId: "ingot", count: 2 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "iron-hoe", count: 1 },
    unlockTier: 2,
    station: "workbench",
  },
  {
    id: "brick",
    ingredients: [{ itemId: "clay", count: 2 }],
    output: { itemId: "brick", count: 1 },
    unlockTier: 2,
    station: "campfire",
  },
  {
    id: "lantern",
    ingredients: [
      { itemId: "ingot", count: 2 },
      { itemId: "torch", count: 2 },
    ],
    output: { itemId: "lantern", count: 1 },
    unlockTier: 2,
    station: "workbench",
  },

  // refined / tier3
  {
    id: "steel-ingot",
    ingredients: [
      { itemId: "ingot", count: 1 },
      { itemId: "coal", count: 1 },
    ],
    output: { itemId: "steel-ingot", count: 1 },
    unlockTier: 3,
    station: "campfire",
  },
  {
    id: "steel-sword",
    ingredients: [
      { itemId: "steel-ingot", count: 2 },
      { itemId: "stick", count: 1 },
    ],
    output: { itemId: "steel-sword", count: 1 },
    unlockTier: 3,
    station: "workbench",
  },
  {
    id: "steel-pickaxe",
    ingredients: [
      { itemId: "steel-ingot", count: 3 },
      { itemId: "stick", count: 2 },
    ],
    output: { itemId: "steel-pickaxe", count: 1 },
    unlockTier: 3,
    station: "workbench",
  },
  {
    id: "glass",
    ingredients: [{ itemId: "sand", count: 2 }],
    output: { itemId: "glass", count: 1 },
    unlockTier: 3,
    station: "campfire",
  },
];
