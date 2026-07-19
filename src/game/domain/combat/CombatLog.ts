/**
 * Combat log + solo damage meter (E2.5) — pure fold of combat events into
 * per-source rolling totals (damage dealt/taken, healing, kills) over a
 * single "encounter" window. An encounter starts on the first event folded
 * and implicitly ends after `ENCOUNTER_TIMEOUT_MS` without another one — the
 * next event after that gap starts a fresh encounter (totals reset), so the
 * meter always reflects "this fight", not a lifetime total.
 *
 * `totals` is keyed by an arbitrary `sourceId` on purpose: this ships wired
 * to only the local player (E2.5, `LOCAL_PLAYER_SOURCE_ID`), but the fold
 * itself is already multi-source — E5.6 (party-wide meter) folds every
 * member's stream through the same function, keyed by peer id, with no
 * shape change here.
 */

export const ENCOUNTER_TIMEOUT_MS = 5000;

export type CombatLogEventKind = "hitDealt" | "hitTaken" | "heal" | "kill";

/** The solo meter's one and only source until E5.6 adds party members. */
export const LOCAL_PLAYER_SOURCE_ID = "player";

export interface CombatLogEvent {
  readonly sourceId: string;
  readonly kind: CombatLogEventKind;
  /** Damage/heal magnitude; ignored (but harmless) for "kill" — kill count
   *  comes from the event firing, not from this value. */
  readonly amount: number;
  /** Caller-supplied clock, ms — determines encounter continuity/reset. */
  readonly atMs: number;
}

export interface SourceTotals {
  readonly sourceId: string;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly healing: number;
  readonly kills: number;
}

export interface CombatLogState {
  /** ms the current encounter began, or null when nothing has been folded
   *  yet (or the prior encounter's window has since lapsed with no fold to
   *  observe it — see `isEncounterActive`). */
  readonly encounterStartMs: number | null;
  readonly lastEventMs: number | null;
  readonly totals: Readonly<Record<string, SourceTotals>>;
}

export function emptyCombatLog(): CombatLogState {
  return { encounterStartMs: null, lastEventMs: null, totals: {} };
}

function emptyTotals(sourceId: string): SourceTotals {
  return { sourceId, damageDealt: 0, damageTaken: 0, healing: 0, kills: 0 };
}

/** Folds one event into the log. A gap of >= ENCOUNTER_TIMEOUT_MS since the
 *  last folded event starts a brand-new encounter (all totals reset) —
 *  otherwise the event accumulates into the current one. Negative/zero
 *  amounts never subtract (a malformed amount is clamped to a no-op delta). */
export function foldCombatEvent(state: CombatLogState, event: CombatLogEvent): CombatLogState {
  const isNewEncounter =
    state.lastEventMs === null || event.atMs - state.lastEventMs >= ENCOUNTER_TIMEOUT_MS;
  const totals = isNewEncounter ? {} : state.totals;
  const prior = totals[event.sourceId] ?? emptyTotals(event.sourceId);
  const amount = Math.max(0, event.amount);
  const next: SourceTotals = {
    ...prior,
    damageDealt: prior.damageDealt + (event.kind === "hitDealt" ? amount : 0),
    damageTaken: prior.damageTaken + (event.kind === "hitTaken" ? amount : 0),
    healing: prior.healing + (event.kind === "heal" ? amount : 0),
    kills: prior.kills + (event.kind === "kill" ? 1 : 0),
  };
  return {
    encounterStartMs: isNewEncounter ? event.atMs : state.encounterStartMs,
    lastEventMs: event.atMs,
    totals: { ...totals, [event.sourceId]: next },
  };
}

/** True while the encounter is still "live" judged against a caller-supplied
 *  clock — mirrors the fold's own timeout so a UI can show "in combat"
 *  without waiting for the next event to notice the window lapsed. */
export function isEncounterActive(state: CombatLogState, nowMs: number): boolean {
  return state.lastEventMs !== null && nowMs - state.lastEventMs < ENCOUNTER_TIMEOUT_MS;
}

/** A single source's totals, or a zeroed row if it hasn't been folded yet
 *  this encounter (never throws — a meter panel can render any id safely). */
export function totalsFor(state: CombatLogState, sourceId: string): SourceTotals {
  return state.totals[sourceId] ?? emptyTotals(sourceId);
}

export function sourceIds(state: CombatLogState): readonly string[] {
  return Object.keys(state.totals);
}

/** Elapsed encounter time never reads as less than this — a single early hit
 *  would otherwise read as an absurd instantaneous DPS. */
const MIN_ELAPSED_S = 1;

/** Damage dealt per second for one source, over the encounter so far (up to
 *  `nowMs`). 0 before any encounter has started or for an unknown source. */
export function dpsFor(state: CombatLogState, sourceId: string, nowMs: number): number {
  if (state.encounterStartMs === null) return 0;
  const totals = state.totals[sourceId];
  if (!totals) return 0;
  const elapsedS = Math.max(MIN_ELAPSED_S, (nowMs - state.encounterStartMs) / 1000);
  return totals.damageDealt / elapsedS;
}
