/**
 * XP + level curve (Phase E1.1). Pure: `grantXp` folds an XP amount into a
 * `LevelState`, rolling over as many levels as the amount covers in one call
 * (never silently drops overflow XP, same "settle everything this tick"
 * posture as `progression/ProgressionState.recordProgressionEvent`).
 *
 * XP sources reuse the existing `ProgressionEvents` action vocabulary
 * (dig/craft/kill/harvest/tame) via `XP_PER_EVENT` — the same event ids the
 * objective/achievement trackers already consume, so a single game action
 * feeds progression AND character XP without a second event bus.
 */

import type { ProgressionEventId } from "../progression/ProgressionEvents";

export interface LevelState {
  readonly level: number;
  readonly xp: number;
}

export function spawnLevelState(): LevelState {
  return { level: 1, xp: 0 };
}

/** Points granted (stat + talent, one each — cozy-simple) per level gained. */
export const POINTS_PER_LEVEL = 1;

/** XP required to advance FROM `level` to `level + 1`. A gentle super-linear
 *  curve: early levels are quick and rewarding, later ones take longer. */
export function xpForLevel(level: number): number {
  return Math.round(50 * Math.pow(Math.max(1, level), 1.5));
}

export interface XpGrantResult {
  readonly state: LevelState;
  readonly levelsGained: number;
  readonly pointsGranted: number;
}

/** Grants XP, rolling over every level the amount covers in one call. A
 *  non-positive amount is a no-op (identity result). */
export function grantXp(state: LevelState, amount: number): XpGrantResult {
  if (amount <= 0) return { state, levelsGained: 0, pointsGranted: 0 };

  let level = state.level;
  let xp = state.xp + amount;
  let levelsGained = 0;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    levelsGained += 1;
  }
  return {
    state: { level, xp },
    levelsGained,
    pointsGranted: levelsGained * POINTS_PER_LEVEL,
  };
}

/** XP granted for one occurrence of a progression action. Every event
 *  currently in the vocabulary grants at least a token amount so no action
 *  feels wasted; kill/tame are the biggest rewards (cozy: rare, exciting
 *  actions pay off more, nothing ever pays negative). */
export const XP_PER_EVENT: Readonly<Record<ProgressionEventId, number>> = {
  dig: 1,
  craft: 3,
  place: 1,
  tame: 15,
  kill: 8,
  eat: 1,
  sleep: 2,
  harvest: 2,
};

export function xpForEvent(event: ProgressionEventId): number {
  return XP_PER_EVENT[event];
}
