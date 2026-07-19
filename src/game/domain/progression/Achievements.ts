/**
 * The achievement set (Workstream 6.1) — 12 unlockable badges covering every
 * major action plus two milestone stretch goals. Unlike objectives these have
 * no prereqs/ordering; each fires independently the moment its predicate is
 * true (the reducer in ProgressionState.ts evaluates all of them every tick).
 */

import type { Achievement } from "./ProgressionState";

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "first-dig",
    titleKey: "achievement.firstDig.title",
    descKey: "achievement.firstDig.desc",
    predicate: (counts) => counts.dig >= 1,
  },
  {
    id: "first-craft",
    titleKey: "achievement.firstCraft.title",
    descKey: "achievement.firstCraft.desc",
    predicate: (counts) => counts.craft >= 1,
  },
  {
    id: "first-place",
    titleKey: "achievement.firstPlace.title",
    descKey: "achievement.firstPlace.desc",
    predicate: (counts) => counts.place >= 1,
  },
  {
    id: "first-tame",
    titleKey: "achievement.firstTame.title",
    descKey: "achievement.firstTame.desc",
    predicate: (counts) => counts.tame >= 1,
  },
  {
    id: "first-kill",
    titleKey: "achievement.firstKill.title",
    descKey: "achievement.firstKill.desc",
    predicate: (counts) => counts.kill >= 1,
  },
  {
    id: "first-eat",
    titleKey: "achievement.firstEat.title",
    descKey: "achievement.firstEat.desc",
    predicate: (counts) => counts.eat >= 1,
  },
  {
    id: "first-sleep",
    titleKey: "achievement.firstSleep.title",
    descKey: "achievement.firstSleep.desc",
    predicate: (counts) => counts.sleep >= 1,
  },
  {
    id: "first-harvest",
    titleKey: "achievement.firstHarvest.title",
    descKey: "achievement.firstHarvest.desc",
    predicate: (counts) => counts.harvest >= 1,
  },
  {
    id: "tier-1-reached",
    titleKey: "achievement.tier1.title",
    descKey: "achievement.tier1.desc",
    predicate: (_counts, state) => state.completedObjectives.includes("tut-craft"),
  },
  {
    id: "builder-10",
    titleKey: "achievement.builder10.title",
    descKey: "achievement.builder10.desc",
    predicate: (counts) => counts.place >= 10,
  },
  {
    id: "survivor-5-nights",
    titleKey: "achievement.survivor5.title",
    descKey: "achievement.survivor5.desc",
    predicate: (counts) => counts.sleep >= 5,
  },
  {
    id: "well-fed-10",
    titleKey: "achievement.wellFed10.title",
    descKey: "achievement.wellFed10.desc",
    predicate: (counts) => counts.eat >= 10,
  },
];
