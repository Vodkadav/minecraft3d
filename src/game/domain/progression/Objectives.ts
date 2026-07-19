/**
 * The scripted first-run objective chain (Workstream 6.2): harvest → craft →
 * place → eat → sleep (survive to morning). Each step's `prereqs` names the
 * previous step, so `currentObjective` (ProgressionState.ts) always resolves
 * to exactly one "what now?" — a linear tutorial, not a tree. The craft step
 * also carries the tier-1 unlock reward, replacing S4's hardcoded
 * `unlockedTier = 1` with a real, TDD'd progression gate.
 */

import type { Objective } from "./ProgressionState";

export const TUTORIAL_OBJECTIVE_IDS = [
  "tut-harvest",
  "tut-craft",
  "tut-place",
  "tut-eat",
  "tut-sleep",
] as const;

export const TUTORIAL_OBJECTIVES: readonly Objective[] = [
  {
    id: "tut-harvest",
    titleKey: "objective.tutHarvest.title",
    descKey: "objective.tutHarvest.desc",
    prereqs: [],
    predicate: (counts) => counts.harvest >= 1,
    progress: { event: "harvest", target: 1 },
  },
  {
    id: "tut-craft",
    titleKey: "objective.tutCraft.title",
    descKey: "objective.tutCraft.desc",
    prereqs: ["tut-harvest"],
    predicate: (counts) => counts.craft >= 1,
    reward: { kind: "unlockTier", tier: 1 },
    progress: { event: "craft", target: 1 },
  },
  {
    id: "tut-place",
    titleKey: "objective.tutPlace.title",
    descKey: "objective.tutPlace.desc",
    prereqs: ["tut-craft"],
    predicate: (counts) => counts.place >= 1,
    progress: { event: "place", target: 1 },
  },
  {
    id: "tut-eat",
    titleKey: "objective.tutEat.title",
    descKey: "objective.tutEat.desc",
    prereqs: ["tut-place"],
    predicate: (counts) => counts.eat >= 1,
    progress: { event: "eat", target: 1 },
  },
  {
    id: "tut-sleep",
    titleKey: "objective.tutSleep.title",
    descKey: "objective.tutSleep.desc",
    prereqs: ["tut-eat"],
    predicate: (counts) => counts.sleep >= 1,
    progress: { event: "sleep", target: 1 },
  },
];
