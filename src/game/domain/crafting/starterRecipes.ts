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
];
