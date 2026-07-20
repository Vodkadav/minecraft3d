/**
 * The default starter research tree (Phase E6.4): three modest branches —
 * gathering, crafting, vitality — each four nodes deep, converging on one
 * shared capstone. Mirrors `TalentTree.TALENT_NODES`'s "data-defined content"
 * style; adding a research node later is one entry here.
 */

import type { ResearchNode } from "./ResearchTree";

export const RESEARCH_NODES: readonly ResearchNode[] = [
  // ---- Gathering branch ----
  {
    id: "sharpTools",
    nameKey: "research.sharpTools.name",
    descKey: "research.sharpTools.desc",
    branch: "gathering",
    cost: 1,
    prereqs: [],
    effect: { kind: "statBonus", stat: "gatherPower", amount: 0.05 },
  },
  {
    id: "efficientHarvest",
    nameKey: "research.efficientHarvest.name",
    descKey: "research.efficientHarvest.desc",
    branch: "gathering",
    cost: 2,
    prereqs: ["sharpTools"],
    effect: { kind: "statBonus", stat: "gatherPower", amount: 0.05 },
  },
  {
    id: "oreSense",
    nameKey: "research.oreSense.name",
    descKey: "research.oreSense.desc",
    branch: "gathering",
    cost: 2,
    prereqs: ["efficientHarvest"],
    effect: { kind: "statBonus", stat: "loot", amount: 0.05 },
  },
  {
    id: "masterGatherer",
    nameKey: "research.masterGatherer.name",
    descKey: "research.masterGatherer.desc",
    branch: "gathering",
    cost: 3,
    prereqs: ["oreSense"],
    effect: { kind: "statBonus", stat: "gatherPower", amount: 0.1 },
  },

  // ---- Crafting branch ----
  {
    id: "basicWorkshop",
    nameKey: "research.basicWorkshop.name",
    descKey: "research.basicWorkshop.desc",
    branch: "crafting",
    cost: 1,
    prereqs: [],
    effect: { kind: "unlockTier", tier: 2 },
  },
  {
    id: "refinedTools",
    nameKey: "research.refinedTools.name",
    descKey: "research.refinedTools.desc",
    branch: "crafting",
    cost: 2,
    prereqs: ["basicWorkshop"],
    effect: { kind: "statBonus", stat: "attackPower", amount: 0.05 },
  },
  {
    id: "advancedWorkshop",
    nameKey: "research.advancedWorkshop.name",
    descKey: "research.advancedWorkshop.desc",
    branch: "crafting",
    cost: 3,
    prereqs: ["refinedTools"],
    effect: { kind: "unlockTier", tier: 3 },
  },
  {
    id: "masterCraftsman",
    nameKey: "research.masterCraftsman.name",
    descKey: "research.masterCraftsman.desc",
    branch: "crafting",
    cost: 3,
    prereqs: ["advancedWorkshop"],
    effect: { kind: "statBonus", stat: "attackPower", amount: 0.1 },
  },

  // ---- Vitality branch ----
  {
    id: "heartyStock",
    nameKey: "research.heartyStock.name",
    descKey: "research.heartyStock.desc",
    branch: "vitality",
    cost: 1,
    prereqs: [],
    effect: { kind: "statBonus", stat: "maxHealth", amount: 0.05 },
  },
  {
    id: "deepReserves",
    nameKey: "research.deepReserves.name",
    descKey: "research.deepReserves.desc",
    branch: "vitality",
    cost: 2,
    prereqs: ["heartyStock"],
    effect: { kind: "statBonus", stat: "maxEnergy", amount: 0.05 },
  },
  {
    id: "fortunateInstincts",
    nameKey: "research.fortunateInstincts.name",
    descKey: "research.fortunateInstincts.desc",
    branch: "vitality",
    cost: 2,
    prereqs: ["deepReserves"],
    effect: { kind: "statBonus", stat: "loot", amount: 0.05 },
  },
  {
    id: "ironWill",
    nameKey: "research.ironWill.name",
    descKey: "research.ironWill.desc",
    branch: "vitality",
    cost: 3,
    prereqs: ["fortunateInstincts"],
    effect: { kind: "statBonus", stat: "maxHealth", amount: 0.1 },
  },

  // ---- Shared capstone (converges all three branches) ----
  {
    id: "grandDesign",
    nameKey: "research.grandDesign.name",
    descKey: "research.grandDesign.desc",
    branch: "crafting",
    cost: 4,
    prereqs: ["masterGatherer", "masterCraftsman", "ironWill"],
    effect: { kind: "statBonus", stat: "loot", amount: 0.15 },
  },
];
