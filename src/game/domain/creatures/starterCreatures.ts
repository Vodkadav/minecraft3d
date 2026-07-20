/**
 * The six creatures that exist today (Workstreams 6.x/7.2), values carried
 * over unchanged from SpawnField.SPAWN_SPECIES / Combat.CREATURE_STATS /
 * CreatureBrain.TEMPERAMENT / Taming.TAMING_RULES / spawn/SpawnPlacement
 * .SPECIES_VISUAL — this is a consolidation, not a rebalance. Adding a
 * creature later (E6.5) is one entry here.
 *
 * E6.3: `biomeAffinity` values reproduce exactly what `BiomeResources.ts`'s
 * old hand-maintained per-biome creature lists said (a consolidation, not a
 * rebalance) — that file now derives its lists from these instead.
 */

import type { CreatureDefinition } from "./CreatureDefinition";
import type { CreatureAbility } from "../ai/CreatureAbilities";

// ---- E7.6 monster abilities — cozy-reskinned, gently damaging, each with a
// telegraphed windup (fairness delay, plan §1). Appended as named constants
// (not inlined) so `starterCreatures.test.ts`-style completeness checks and
// `CreatureAbilities.test.ts` can both point at the same literal values.
// Only species that already bite (stats.damage > 0) get one; boar is left
// melee-only on purpose — not every hostile creature needs every system. ----
const WOLF_THORN_SPIT: CreatureAbility = {
  id: "wolf-thorn-spit",
  kind: "rangedSpit",
  castStyle: "retreatAndFire",
  range: 12,
  minRange: 5,
  windupMs: 700,
  cooldownMs: 4000,
  damage: 4,
  projectileId: "wolf-thorn",
  damageType: "physical",
  feelEvent: "arrowHit",
};
const BEAR_GROUND_POUND: CreatureAbility = {
  id: "bear-ground-pound",
  kind: "aoeStomp",
  castStyle: "standAndCast",
  range: 6,
  windupMs: 900,
  cooldownMs: 6000,
  damage: 6,
  aoeId: "bear-stomp",
  damageType: "physical",
  feelEvent: "boom",
};
const BADGER_ACORN_BURST: CreatureAbility = {
  id: "badger-acorn-burst",
  kind: "cozySpell",
  castStyle: "standAndCast",
  range: 9,
  windupMs: 500,
  cooldownMs: 5000,
  damage: 3,
  projectileId: "badger-acorn",
  damageType: "nature",
  feelEvent: "spellNature",
};

export const STARTER_CREATURES: readonly CreatureDefinition[] = [
  {
    id: "deer",
    kind: "creature",
    spawnWeight: 0.35,
    maxPerCell: 1,
    stats: {
      maxHealth: 20,
      damage: 0,
      loot: [
        { itemId: "meat", min: 1, max: 2 },
        { itemId: "hide", min: 1, max: 1 },
      ],
    },
    temperament: { reactRange: 18, aggressive: false, fleeBelowHealth: 1 },
    taming: { foodItemId: "berries", feedsRequired: 3, cooldownMs: 5000 },
    disposition: "friendly",
    visual: { shape: "cone", color: 0xb98a5a, size: 1.4, lift: 0.7 },
    biomeAffinity: ["lowland"],
  },
  {
    id: "wolf",
    kind: "creature",
    spawnWeight: 0.2,
    maxPerCell: 1,
    stats: {
      maxHealth: 35,
      damage: 6,
      loot: [
        { itemId: "meat", min: 2, max: 3 },
        { itemId: "hide", min: 1, max: 2 },
      ],
    },
    temperament: { reactRange: 14, aggressive: true, fleeBelowHealth: 0.3 },
    taming: { foodItemId: "meat", feedsRequired: 4, cooldownMs: 8000 },
    disposition: "hostile",
    visual: { shape: "cone", color: 0x5d4633, size: 1.0, lift: 0.5 },
    biomeAffinity: ["highland", "alpine"],
    // E7.6: retreat-and-fire — the wolf backs off to spit thorns rather than
    // always closing to a bite.
    abilities: [WOLF_THORN_SPIT],
  },

  // ---- Workstream 7.2 creature variety ----
  {
    id: "elk",
    kind: "creature",
    spawnWeight: 0.15,
    maxPerCell: 1,
    stats: {
      maxHealth: 40,
      damage: 0,
      loot: [
        { itemId: "meat", min: 2, max: 4 },
        { itemId: "hide", min: 1, max: 2 },
        { itemId: "wool", min: 1, max: 2 },
      ],
    },
    temperament: { reactRange: 16, aggressive: false, fleeBelowHealth: 1 },
    taming: { foodItemId: "carrot", feedsRequired: 4, cooldownMs: 6000 },
    disposition: "friendly",
    visual: { shape: "cone", color: 0x8a6a45, size: 1.7, lift: 0.85 },
    biomeAffinity: ["highland", "alpine"],
  },
  {
    id: "fox",
    kind: "creature",
    spawnWeight: 0.25,
    maxPerCell: 1,
    stats: {
      maxHealth: 14,
      damage: 0,
      loot: [
        { itemId: "hide", min: 1, max: 1 },
        { itemId: "feather", min: 0, max: 1 },
      ],
    },
    temperament: { reactRange: 20, aggressive: false, fleeBelowHealth: 1 },
    // untameable — a small, timid animal, not every creature needs to be a mount.
    disposition: "neutral",
    visual: { shape: "cone", color: 0xc5622a, size: 0.7, lift: 0.35 },
    biomeAffinity: ["lowland"],
  },
  {
    id: "boar",
    kind: "creature",
    spawnWeight: 0.15,
    maxPerCell: 1,
    stats: {
      maxHealth: 28,
      damage: 5,
      loot: [
        { itemId: "meat", min: 1, max: 2 },
        { itemId: "hide", min: 1, max: 1 },
      ],
    },
    temperament: { reactRange: 10, aggressive: true, fleeBelowHealth: 0.2 },
    // untameable — aggressive wild animal, not a mount.
    disposition: "hostile",
    visual: { shape: "cone", color: 0x4a3728, size: 1.1, lift: 0.5 },
    biomeAffinity: ["highland"],
  },
  {
    id: "rabbit",
    kind: "creature",
    spawnWeight: 0.3,
    maxPerCell: 2,
    stats: {
      maxHealth: 6,
      damage: 0,
      loot: [{ itemId: "feather", min: 1, max: 2 }],
    },
    temperament: { reactRange: 22, aggressive: false, fleeBelowHealth: 1 },
    // untameable — small and timid, not a mount.
    disposition: "neutral",
    visual: { shape: "sphere", color: 0xcfc6b8, size: 0.4, lift: 0.2 },
    biomeAffinity: ["lowland"],
  },

  // ---- E6.5 asset-library expansion — primitive-only visuals, no rigged
  // models (no new downloaded assets); CreatureModelLibrary.has() gates
  // these to their CreatureVisual primitive automatically, same as boar and
  // rabbit above. Appended (not inserted) so existing species keep their
  // SpawnField salt index. ----
  {
    id: "sheep",
    kind: "creature",
    spawnWeight: 0.25,
    maxPerCell: 2,
    stats: {
      maxHealth: 18,
      damage: 0,
      loot: [
        { itemId: "wool", min: 1, max: 2 },
        { itemId: "meat", min: 1, max: 2 },
      ],
    },
    temperament: { reactRange: 16, aggressive: false, fleeBelowHealth: 1 },
    taming: { foodItemId: "wheat", feedsRequired: 3, cooldownMs: 5000 },
    disposition: "friendly",
    visual: { shape: "sphere", color: 0xe8e2d0, size: 0.9, lift: 0.4 },
    biomeAffinity: ["lowland"],
  },
  {
    id: "bear",
    kind: "creature",
    spawnWeight: 0.08,
    maxPerCell: 1,
    stats: {
      maxHealth: 60,
      damage: 10,
      loot: [
        { itemId: "meat", min: 2, max: 4 },
        { itemId: "hide", min: 1, max: 2 },
        { itemId: "bear-claw", min: 0, max: 1 },
      ],
    },
    temperament: { reactRange: 12, aggressive: true, fleeBelowHealth: 0.15 },
    // untameable — big and dangerous, not a mount.
    disposition: "hostile",
    visual: { shape: "cone", color: 0x3b2a1d, size: 1.6, lift: 0.8 },
    biomeAffinity: ["highland"],
    // E7.6: stand-and-cast — the bear plants and pounds the ground.
    abilities: [BEAR_GROUND_POUND],
  },
  {
    id: "owl",
    kind: "creature",
    spawnWeight: 0.12,
    maxPerCell: 1,
    stats: {
      maxHealth: 8,
      damage: 0,
      loot: [{ itemId: "feather", min: 1, max: 2 }],
    },
    temperament: { reactRange: 20, aggressive: false, fleeBelowHealth: 1 },
    // untameable — a small forest bird.
    disposition: "neutral",
    visual: { shape: "sphere", color: 0x8a6f4e, size: 0.5, lift: 0.4 },
    biomeAffinity: ["lowland"],
    // E6.3: the nocturnal candidate flagged by E6.5 — owls read as a "comes
    // out at night" species. Flavor only, not a danger spike (still passive).
    activityWindow: "nocturnal",
  },
  {
    id: "badger",
    kind: "creature",
    spawnWeight: 0.12,
    maxPerCell: 1,
    stats: {
      maxHealth: 22,
      damage: 4,
      loot: [
        { itemId: "hide", min: 1, max: 1 },
        { itemId: "meat", min: 1, max: 1 },
      ],
    },
    temperament: { reactRange: 10, aggressive: true, fleeBelowHealth: 0.25 },
    // untameable — a grumpy little digger.
    disposition: "hostile",
    visual: { shape: "cone", color: 0x2e2e2e, size: 0.6, lift: 0.3 },
    biomeAffinity: ["highland"],
    // E6.3: secondary nocturnal candidate flagged by E6.5. Its bite damage
    // is unchanged — nocturnal is presentation flavor, never a danger spike.
    activityWindow: "nocturnal",
    // E7.6: stand-and-cast — a whimsical acorn toss (cozySpell flavor).
    abilities: [BADGER_ACORN_BURST],
  },
  {
    id: "squirrel",
    kind: "creature",
    spawnWeight: 0.3,
    maxPerCell: 2,
    stats: {
      maxHealth: 5,
      damage: 0,
      loot: [
        { itemId: "acorn", min: 1, max: 2 },
        { itemId: "fiber", min: 0, max: 1 },
      ],
    },
    temperament: { reactRange: 22, aggressive: false, fleeBelowHealth: 1 },
    // untameable — tiny and skittish.
    disposition: "neutral",
    visual: { shape: "sphere", color: 0xa9682f, size: 0.35, lift: 0.2 },
    biomeAffinity: ["lowland"],
  },
];
