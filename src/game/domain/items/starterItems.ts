/**
 * A small, realistic starter item table for the survival core. Kept minimal —
 * enough to exercise gathering → inventory → crafting end-to-end. Later
 * milestones extend the table; nothing here is renderer- or engine-aware.
 */

import type { ItemDefinition } from "./ItemDefinition";

export const STARTER_ITEMS: readonly ItemDefinition[] = [
  { id: "wood", displayName: "Wood", maxStackSize: 64, tags: ["natural", "flammable"], tier: 0 },
  { id: "stone", displayName: "Stone", maxStackSize: 64, tags: ["natural"], tier: 0 },
  { id: "ore", displayName: "Iron Ore", maxStackSize: 64, tags: ["natural", "smeltable"], tier: 1 },
  { id: "plank", displayName: "Plank", maxStackSize: 64, tags: ["crafted"], tier: 0 },
  { id: "ingot", displayName: "Iron Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 1 },
  { id: "stick", displayName: "Stick", maxStackSize: 64, tags: ["crafted"], tier: 0 },
  { id: "pickaxe", displayName: "Iron Pickaxe", maxStackSize: 1, tags: ["tool"], tier: 1 },
  // Combat/harvest loot (Combat.ts CREATURE_STATS, Taming.ts TAMING_RULES) —
  // meat/berries/hide were referenced by id there before ever being
  // registered; Workstream 5.2 adds them here with food metadata.
  {
    id: "meat",
    displayName: "Meat",
    maxStackSize: 64,
    tags: ["natural", "food"],
    tier: 0,
    food: { hungerRestore: 25, healthRestore: 5 },
  },
  {
    id: "berries",
    displayName: "Berries",
    maxStackSize: 64,
    tags: ["natural", "food"],
    tier: 0,
    food: { hungerRestore: 15, healthRestore: 0 },
  },
  { id: "hide", displayName: "Hide", maxStackSize: 64, tags: ["natural", "material"], tier: 0 },
];
