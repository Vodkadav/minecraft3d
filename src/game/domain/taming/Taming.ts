/**
 * Taming state machine (plan 6.4 [O]). Pure: a creature is tamed by a
 * multi-step feed sequence — the right food, patiently (respecting a
 * cooldown between feeds). Wrong food or an impatient feed spooks the
 * creature and resets progress. A tamed beast is rideable (research §5:
 * the no-saddle model — taming itself unlocks riding; the [F] mount
 * adapter is M6.5). Timestamps come from the caller, so the machine is
 * exactly testable.
 */

export interface TamingRules {
  readonly foodItemId: string;
  readonly feedsRequired: number;
  readonly cooldownMs: number;
}

/** Species without an entry are untameable. */
export const TAMING_RULES: Readonly<Record<string, TamingRules>> = {
  deer: { foodItemId: "berries", feedsRequired: 3, cooldownMs: 5000 },
  boar: { foodItemId: "meat", feedsRequired: 4, cooldownMs: 8000 },
};

export type TamingPhase = "wild" | "tamed";

export interface TamingState {
  readonly species: string;
  readonly phase: TamingPhase;
  readonly progress: number;
  readonly lastFedAt: number | null;
}

export function startTaming(species: string): TamingState {
  return { species, phase: "wild", progress: 0, lastFedAt: null };
}

export interface FeedResult {
  readonly state: TamingState;
  /** True exactly once — on the feed that completes the sequence. */
  readonly becameTamed: boolean;
}

export function feed(state: TamingState, itemId: string, atMs: number): FeedResult {
  if (state.phase === "tamed") return { state, becameTamed: false };
  const rules = TAMING_RULES[state.species];
  if (!rules) return { state, becameTamed: false };

  const wrongFood = itemId !== rules.foodItemId;
  const impatient = state.lastFedAt !== null && atMs - state.lastFedAt < rules.cooldownMs;
  if (wrongFood || impatient) {
    return { state: { ...state, progress: 0, lastFedAt: atMs }, becameTamed: false };
  }

  const progress = state.progress + 1;
  if (progress >= rules.feedsRequired) {
    return {
      state: { ...state, phase: "tamed", progress, lastFedAt: atMs },
      becameTamed: true,
    };
  }
  return { state: { ...state, progress, lastFedAt: atMs }, becameTamed: false };
}

export function isRideable(state: TamingState): boolean {
  return state.phase === "tamed";
}
