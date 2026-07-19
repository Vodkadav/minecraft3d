/**
 * Difficulty multiplier table (Workstream 5.6). Peaceful zeroes both hunger
 * decay (so starvation damage — gated on hunger reaching 0 — never triggers,
 * with no separate flag needed) and creature contact damage; hard raises
 * both and switches the death penalty away from the family-friendly default.
 */

import type { DeathPenalty } from "../survival/Respawn";

export type Difficulty = "peaceful" | "normal" | "hard";

export const DIFFICULTIES: readonly Difficulty[] = ["peaceful", "normal", "hard"];

export interface DifficultyRules {
  /** Multiplies hunger decay (domain/survival/Survival's hungerRateMult). */
  readonly hungerRate: number;
  /** Multiplies aggressive-creature bite damage on the player. */
  readonly creatureDamage: number;
  readonly deathPenalty: DeathPenalty;
}

export const DIFFICULTY_RULES: Readonly<Record<Difficulty, DifficultyRules>> = {
  peaceful: { hungerRate: 0, creatureDamage: 0, deathPenalty: "keep-inventory" },
  normal: { hungerRate: 1, creatureDamage: 1, deathPenalty: "keep-inventory" },
  hard: { hungerRate: 1.5, creatureDamage: 1.5, deathPenalty: "drop-hotbar" },
};

export function difficultyRules(d: Difficulty): DifficultyRules {
  return DIFFICULTY_RULES[d];
}
