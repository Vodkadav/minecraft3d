/**
 * Focus resource (E7.3 spellcasting) — a regenerating resource that gates
 * spell casts, mirroring `Survival.ts`'s stamina shape (state + tick regen +
 * spend, "rejected, not clamped" on an unaffordable spend). A separate pool
 * from stamina/hunger: casting a spell costs focus, sprinting/swinging costs
 * stamina — the two never share a meter, so equipping spells never eats into
 * a player's physical stamina, and vice versa.
 */

export const FOCUS_MAX = 100;
/** Passive regen — a full drain-to-empty recovers in a little over 11s. */
const FOCUS_REGEN_PER_S = 9;

export interface FocusState {
  readonly focus: number;
}

/** `maxFocus` defaults to `FOCUS_MAX` — a stats-less caller behaves exactly
 *  like every other survival-resource spawn (see `spawnSurvival`). */
export function spawnFocus(maxFocus: number = FOCUS_MAX): FocusState {
  return { focus: maxFocus };
}

/** A negative cost never affords (a caller bug, not a free cast); otherwise
 *  affordable iff the pool covers it. */
export function canCast(state: FocusState, cost: number): boolean {
  return cost >= 0 && state.focus >= cost;
}

/** One frame of passive regen, capped at `maxFocus`. Non-positive `dt` is a
 *  no-op rather than draining focus backwards. */
export function tickFocus(state: FocusState, dt: number, maxFocus: number = FOCUS_MAX): FocusState {
  if (dt <= 0) return state;
  return { focus: Math.min(maxFocus, state.focus + dt * FOCUS_REGEN_PER_S) };
}

/** Spend `cost` focus for a cast; a no-op (identity) if unaffordable — mirrors
 *  `drainStaminaForAttack`'s "rejected, not clamped" contract, never going
 *  negative and never silently partial-casting. */
export function spendFocus(state: FocusState, cost: number): FocusState {
  if (!canCast(state, cost)) return state;
  return { focus: state.focus - cost };
}
