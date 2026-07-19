/**
 * The pure progression read-model + reducer (Workstream 6.1). `ProgressionState`
 * is nothing but event counts and completed-id sets; objectives/achievements/the
 * tier curve are plain data (Objectives.ts, Achievements.ts) evaluated against it
 * — no engine, no I/O, fully unit-testable.
 *
 * `recordProgressionEvent` is the one state transition: bump the event count,
 * then re-evaluate every not-yet-completed objective/achievement whose
 * prereqs are already satisfied. Order matters for objectives (a tutorial
 * chain) — evaluation runs prereq-satisfied objectives in list order so a
 * later step can never complete before an earlier one in the same event.
 */

import type { ProgressionEventId } from "./ProgressionEvents";
import { PROGRESSION_EVENT_IDS } from "./ProgressionEvents";

export type ProgressionCounts = Readonly<Record<ProgressionEventId, number>>;

export interface ProgressionState {
  readonly counts: ProgressionCounts;
  readonly completedObjectives: readonly string[];
  readonly unlockedAchievements: readonly string[];
  readonly tutorialSkipped: boolean;
}

export interface Objective {
  readonly id: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly prereqs: readonly string[];
  readonly predicate: (counts: ProgressionCounts) => boolean;
  /** Progression reward — currently only the recipe-tier gate (Crafting.unlockTier). */
  readonly reward?: { readonly kind: "unlockTier"; readonly tier: number };
  /** Optional display metric for the objective tracker HUD ("0/1" progress) —
   *  present when the predicate is a simple event-count threshold. */
  readonly progress?: { readonly event: ProgressionEventId; readonly target: number };
}

/** Read the tracker's "n/target" progress for an objective, clamped to target. */
export function objectiveProgress(
  objective: Objective,
  counts: ProgressionCounts,
): { readonly current: number; readonly target: number } | null {
  if (!objective.progress) return null;
  const { event, target } = objective.progress;
  return { current: Math.min(counts[event], target), target };
}

export interface Achievement {
  readonly id: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly predicate: (counts: ProgressionCounts, state: ProgressionState) => boolean;
}

export function emptyProgression(): ProgressionState {
  const counts = Object.fromEntries(PROGRESSION_EVENT_IDS.map((id) => [id, 0])) as Record<
    ProgressionEventId,
    number
  >;
  return {
    counts,
    completedObjectives: [],
    unlockedAchievements: [],
    tutorialSkipped: false,
  };
}

function prereqsMet(objective: Objective, completed: ReadonlySet<string>): boolean {
  return objective.prereqs.every((id) => completed.has(id));
}

export interface RecordResult {
  readonly state: ProgressionState;
  readonly newlyCompletedObjectives: readonly Objective[];
  readonly newlyUnlockedAchievements: readonly Achievement[];
}

/** One event tick: bump its count, then settle objectives/achievements against
 *  the new counts. A single event can complete more than one chained step
 *  (e.g. an objective whose prereq was itself just completed this tick). */
export function recordProgressionEvent(
  state: ProgressionState,
  event: ProgressionEventId,
  objectives: readonly Objective[],
  achievements: readonly Achievement[],
): RecordResult {
  const counts: ProgressionCounts = { ...state.counts, [event]: state.counts[event] + 1 };
  let working: ProgressionState = { ...state, counts };

  const newlyCompletedObjectives: Objective[] = [];
  let completed = new Set(working.completedObjectives);
  let settledSomething = true;
  while (settledSomething) {
    settledSomething = false;
    for (const objective of objectives) {
      if (completed.has(objective.id)) continue;
      if (!prereqsMet(objective, completed)) continue;
      if (!objective.predicate(working.counts)) continue;
      completed = new Set([...completed, objective.id]);
      newlyCompletedObjectives.push(objective);
      settledSomething = true;
    }
  }
  working = { ...working, completedObjectives: [...completed] };

  const newlyUnlockedAchievements: Achievement[] = [];
  const unlocked = new Set(working.unlockedAchievements);
  for (const achievement of achievements) {
    if (unlocked.has(achievement.id)) continue;
    if (!achievement.predicate(working.counts, working)) continue;
    unlocked.add(achievement.id);
    newlyUnlockedAchievements.push(achievement);
  }
  working = { ...working, unlockedAchievements: [...unlocked] };

  return { state: working, newlyCompletedObjectives, newlyUnlockedAchievements };
}

/** The tier curve (6.1): the highest `unlockTier` reward among completed
 *  objectives, 0 if none — replaces S4's hardcoded `unlockedTier`. */
export function unlockedTierFor(
  completedObjectives: readonly string[],
  objectives: readonly Objective[],
): number {
  const completed = new Set(completedObjectives);
  let tier = 0;
  for (const objective of objectives) {
    if (!objective.reward || objective.reward.kind !== "unlockTier") continue;
    if (!completed.has(objective.id)) continue;
    tier = Math.max(tier, objective.reward.tier);
  }
  return tier;
}

export function skipTutorial(state: ProgressionState): ProgressionState {
  return { ...state, tutorialSkipped: true };
}

/** The first not-yet-completed objective in list order whose prereqs are
 *  met — "what now?" for the objective tracker HUD. Skipping the tutorial
 *  hides tutorial-chain objectives (identified by the caller's own id list)
 *  from this lookup via `excludeIds`. */
export function currentObjective(
  state: ProgressionState,
  objectives: readonly Objective[],
  excludeIds: ReadonlySet<string> = new Set(),
): Objective | null {
  const completed = new Set(state.completedObjectives);
  for (const objective of objectives) {
    if (excludeIds.has(objective.id)) continue;
    if (completed.has(objective.id)) continue;
    if (!prereqsMet(objective, completed)) continue;
    return objective;
  }
  return null;
}
