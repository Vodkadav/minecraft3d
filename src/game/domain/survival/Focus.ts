/**
 * "Focus" — the spellcasting resource (E7.3, plan §4). Mirrors the stamina
 * shape in `Survival.ts` (spawn full / gate-check / spend / regen-tick) but
 * stays its own tiny module rather than folding into `SurvivalState`: unlike
 * stamina (client-local, feel-only), focus is HOST-AUTHORITATIVE — a peer's
 * cast is only ever debited against the HOST's own copy
 * (`HostSession.handleCastSpell`), never a client claim (ADR 0004 §2). A
 * client-side copy (e.g. for the cast-bar HUD) is purely a readout of the
 * host's `focus` field on the peer's `partyVitals`-style report, not a second
 * source of truth.
 */

export const FOCUS_MAX = 100;

/** Regenerates from empty to full in ~14s — slower than stamina (E1.4b's
 *  ~7s) since a spell is a bigger tactical spend than a swing/sprint. */
const FOCUS_REGEN_PER_S = 7;

export interface FocusState {
  readonly focus: number;
}

export function spawnFocus(maxFocus: number = FOCUS_MAX): FocusState {
  return { focus: maxFocus };
}

/** Whether `cost` can be afforded right now — the host checks this before
 *  ever resolving a cast's effect (security item 2d). */
export function canCast(state: FocusState, cost: number): boolean {
  return state.focus >= cost;
}

/** Debit `cost` for a cast; a no-op (never goes negative) if it can't be
 *  afforded — the caller (`HostSession`) is expected to have already gated
 *  on `canCast` and simply drop the cast instead of calling this, but this
 *  stays safe either way (mirrors `drainStaminaForAttack`'s no-op-on-gated
 *  shape). */
export function spendFocus(state: FocusState, cost: number): FocusState {
  if (!canCast(state, cost)) return state;
  return { focus: state.focus - cost };
}

/** One frame/tick of passive regen, capped at `maxFocus`. A non-positive
 *  `dt` is a no-op rather than draining or throwing. */
export function tickFocus(state: FocusState, dt: number, maxFocus: number = FOCUS_MAX): FocusState {
  if (dt <= 0) return state;
  return { focus: Math.min(maxFocus, state.focus + dt * FOCUS_REGEN_PER_S) };
}
