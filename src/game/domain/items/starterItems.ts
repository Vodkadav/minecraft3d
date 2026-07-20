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

  // ---- Workstream 7.1 content-depth expansion (wood -> stone -> metal -> refined) ----
  // Natural/gatherable roots (tier reflects the progression band they unlock in, not
  // rarity) — every crafted item below is reachable from one of these via a recipe
  // chain (asserted by RecipeGraph.test.ts).
  { id: "fiber", displayName: "Plant Fiber", maxStackSize: 64, tags: ["natural"], tier: 0 },
  { id: "wool", displayName: "Wool", maxStackSize: 64, tags: ["natural", "material"], tier: 0 },
  {
    id: "fish",
    displayName: "Raw Fish",
    maxStackSize: 64,
    tags: ["natural", "food"],
    tier: 0,
    food: { hungerRestore: 10, healthRestore: 0 },
  },
  { id: "wheat-seed", displayName: "Wheat Seeds", maxStackSize: 64, tags: ["natural", "seed"], tier: 0 },
  { id: "carrot-seed", displayName: "Carrot Seeds", maxStackSize: 64, tags: ["natural", "seed"], tier: 0 },
  { id: "potato-seed", displayName: "Potato Seeds", maxStackSize: 64, tags: ["natural", "seed"], tier: 0 },
  {
    id: "wheat",
    displayName: "Wheat",
    maxStackSize: 64,
    tags: ["natural", "crop", "food"],
    tier: 0,
    food: { hungerRestore: 5, healthRestore: 0 },
  },
  {
    id: "carrot",
    displayName: "Carrot",
    maxStackSize: 64,
    tags: ["natural", "crop", "food"],
    tier: 0,
    food: { hungerRestore: 8, healthRestore: 0 },
  },
  {
    id: "potato",
    displayName: "Potato",
    maxStackSize: 64,
    tags: ["natural", "crop", "food"],
    tier: 0,
    food: { hungerRestore: 6, healthRestore: 0 },
  },
  { id: "clay", displayName: "Clay", maxStackSize: 64, tags: ["natural"], tier: 1 },
  { id: "sand", displayName: "Sand", maxStackSize: 64, tags: ["natural"], tier: 1 },
  { id: "flint", displayName: "Flint", maxStackSize: 64, tags: ["natural"], tier: 1 },
  { id: "feather", displayName: "Feather", maxStackSize: 64, tags: ["natural", "material"], tier: 0 },
  { id: "coal", displayName: "Coal", maxStackSize: 64, tags: ["natural", "smeltable"], tier: 1 },
  { id: "gold-ore", displayName: "Gold Ore", maxStackSize: 64, tags: ["natural", "smeltable"], tier: 2 },
  { id: "copper-ore", displayName: "Copper Ore", maxStackSize: 64, tags: ["natural", "smeltable"], tier: 2 },

  // Crafted — wood/tier0
  { id: "rope", displayName: "Rope", maxStackSize: 64, tags: ["crafted"], tier: 0 },
  { id: "cloth", displayName: "Cloth", maxStackSize: 64, tags: ["crafted"], tier: 0 },
  { id: "charcoal", displayName: "Charcoal", maxStackSize: 64, tags: ["crafted", "smeltable"], tier: 0 },
  { id: "torch", displayName: "Torch", maxStackSize: 64, tags: ["crafted", "placeable", "light"], tier: 0 },
  {
    id: "cooked-meat",
    displayName: "Cooked Meat",
    maxStackSize: 64,
    tags: ["crafted", "food"],
    tier: 0,
    food: { hungerRestore: 35, healthRestore: 8 },
  },
  {
    id: "cooked-fish",
    displayName: "Cooked Fish",
    maxStackSize: 64,
    tags: ["crafted", "food"],
    tier: 0,
    food: { hungerRestore: 30, healthRestore: 4 },
  },
  {
    id: "bread",
    displayName: "Bread",
    maxStackSize: 64,
    tags: ["crafted", "food"],
    tier: 0,
    food: { hungerRestore: 25, healthRestore: 0 },
  },
  {
    id: "baked-potato",
    displayName: "Baked Potato",
    maxStackSize: 64,
    tags: ["crafted", "food"],
    tier: 0,
    food: { hungerRestore: 22, healthRestore: 0 },
  },

  // Crafted — stone/tier1
  { id: "stone-brick", displayName: "Stone Brick", maxStackSize: 64, tags: ["crafted"], tier: 1 },
  { id: "stone-axe", displayName: "Stone Axe", maxStackSize: 1, tags: ["tool"], tier: 1 },
  { id: "stone-pickaxe", displayName: "Stone Pickaxe", maxStackSize: 1, tags: ["tool"], tier: 1 },

  // Crafted — metal/tier2
  { id: "gold-ingot", displayName: "Gold Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 2 },
  { id: "copper-ingot", displayName: "Copper Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 2 },
  { id: "nails", displayName: "Nails", maxStackSize: 64, tags: ["crafted", "metal"], tier: 2 },
  { id: "iron-sword", displayName: "Iron Sword", maxStackSize: 1, tags: ["tool", "weapon"], tier: 2 },
  { id: "iron-axe", displayName: "Iron Axe", maxStackSize: 1, tags: ["tool"], tier: 2 },
  { id: "iron-hoe", displayName: "Iron Hoe", maxStackSize: 1, tags: ["tool"], tier: 2 },
  { id: "brick", displayName: "Brick", maxStackSize: 64, tags: ["crafted"], tier: 2 },
  {
    id: "lantern",
    displayName: "Lantern",
    maxStackSize: 64,
    tags: ["crafted", "placeable", "light"],
    tier: 2,
  },

  // Crafted — refined/tier3
  { id: "steel-ingot", displayName: "Steel Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 3 },
  { id: "steel-sword", displayName: "Steel Sword", maxStackSize: 1, tags: ["tool", "weapon"], tier: 3 },
  { id: "steel-pickaxe", displayName: "Steel Pickaxe", maxStackSize: 1, tags: ["tool"], tier: 3 },
  { id: "glass", displayName: "Glass", maxStackSize: 64, tags: ["crafted"], tier: 3 },

  // ---- E6.5 asset-library expansion ----
  // Latent-gap fix: the treasure system (domain/treasure/HiddenTreasure.ts
  // REWARD_TABLE) has always granted these three ids, but they were never
  // registered here — an unregistered reward silently fails ItemRegistry
  // lookups. Tagged "natural" (a found-not-crafted root, same convention as
  // "sand"/"clay"/"flint") so RecipeGraph.test.ts's reachability walk treats
  // them as roots without inventing a fake gather recipe for currency.
  { id: "coin", displayName: "Coin", maxStackSize: 64, tags: ["natural", "treasure"], tier: 0 },
  { id: "gem", displayName: "Gem", maxStackSize: 64, tags: ["natural", "treasure"], tier: 1 },
  { id: "relic", displayName: "Relic", maxStackSize: 64, tags: ["natural", "treasure"], tier: 2 },

  // Creature-tied drops (new species below)
  { id: "bear-claw", displayName: "Bear Claw", maxStackSize: 64, tags: ["natural", "material"], tier: 2 },
  {
    id: "acorn",
    displayName: "Acorn",
    maxStackSize: 64,
    tags: ["natural", "food"],
    tier: 0,
    food: { hungerRestore: 8, healthRestore: 0 },
  },

  // Beehive gatherable (SpawnField "beehive" node)
  { id: "beeswax", displayName: "Beeswax", maxStackSize: 64, tags: ["natural", "material"], tier: 1 },
  {
    id: "honey",
    displayName: "Honey",
    maxStackSize: 64,
    tags: ["natural", "food"],
    tier: 0,
    food: { hungerRestore: 18, healthRestore: 4 },
  },

  // Silver ore chain ("silver-vein" node, alpine)
  { id: "silver-ore", displayName: "Silver Ore", maxStackSize: 64, tags: ["natural", "smeltable"], tier: 2 },
  { id: "silver-ingot", displayName: "Silver Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 2 },
  { id: "silver-ring", displayName: "Silver Ring", maxStackSize: 1, tags: ["crafted", "gear"], tier: 2 },

  // Cozy trinkets/gear (no equip system yet — inventory items only)
  { id: "claw-necklace", displayName: "Claw Necklace", maxStackSize: 1, tags: ["crafted", "gear"], tier: 2 },
  { id: "wool-hat", displayName: "Wool Hat", maxStackSize: 1, tags: ["crafted", "gear"], tier: 1 },
  { id: "fur-boots", displayName: "Fur Boots", maxStackSize: 1, tags: ["crafted", "gear"], tier: 1 },

  // Gilded tier-4 progression — a use for found gems/relics beyond selling
  { id: "gilded-ingot", displayName: "Gilded Ingot", maxStackSize: 64, tags: ["crafted", "metal"], tier: 4 },
  { id: "gilded-sword", displayName: "Gilded Sword", maxStackSize: 1, tags: ["tool", "weapon", "crafted"], tier: 4 },
  { id: "gilded-pickaxe", displayName: "Gilded Pickaxe", maxStackSize: 1, tags: ["tool", "crafted"], tier: 4 },
  { id: "relic-charm", displayName: "Relic Charm", maxStackSize: 1, tags: ["crafted", "gear"], tier: 4 },

  // --- E7.4 explosives ---
  // The starter thrown weapon exercising the shared AoeRegistry resolver
  // (Aoe.ts) — `combat.aoe` points at the "bomb-boom" AoeSpec. No `projectile`
  // yet: the arc/throw simulation is E7.2's host-projectile stream to wire;
  // this item just carries the data a future intent handler will consume.
  {
    id: "bomb",
    displayName: "Bomb",
    maxStackSize: 16,
    tags: ["weapon", "thrown", "crafted"],
    tier: 1,
    combat: {
      kind: "thrown",
      damage: 30,
      attackSpeed: 0.8,
      aoe: "bomb-boom",
      damageType: "boom",
      feelEvent: "boom",
    },
  },
];
