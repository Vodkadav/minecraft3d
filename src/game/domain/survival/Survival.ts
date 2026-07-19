/**
 * Hunger + stamina domain (Workstream 5.1). Composes alongside
 * `domain/combat/PlayerVitals` rather than folding into it — PlayerVitals'
 * public API (health/dead/regen) stays untouched; survival is a second,
 * independently-tickable value threaded the same way (`tick(dt)` from the
 * app/composition layer). Starvation damage is exposed as a pure amount
 * (`starvationDamagePerTick`) rather than applied here, so the call site
 * composes it through `damagePlayer` — one death/respawn path, not two.
 */

export const HUNGER_MAX = 100;
export const STAMINA_MAX = 100;

/** Passive hunger decay — empties from full in ~14 minutes of normal play. */
const HUNGER_DECAY_PER_S = 0.12;
/** Extra hunger drain while sprinting, on top of the passive decay. */
const HUNGER_SPRINT_EXTRA_PER_S = 0.3;
/** Hunger spent per attack swing. */
const HUNGER_ATTACK_COST = 1;
/** Health lost per second while hunger is at 0. */
export const STARVATION_DAMAGE_PER_S = 2;

const STAMINA_SPRINT_DRAIN_PER_S = 18;
const STAMINA_ATTACK_COST = 12;
const STAMINA_REGEN_PER_S = 14;
/** Once stamina hits empty, sprint/attack stay gated until it recovers past
 *  this fraction of max — prevents rapid empty/act/empty flicker. */
const STAMINA_GATE_RECOVER_FRAC = 0.2;

export interface SurvivalState {
  readonly hunger: number;
  readonly stamina: number;
  /** True while stamina is empty or still recovering toward the gate threshold. */
  readonly staminaGated: boolean;
}

/** `maxEnergy` defaults to `STAMINA_MAX` — a stats-less caller (or the
 *  multiplier defaulting to 1, see `character/Character.ts`) behaves exactly
 *  as before E1.4b. */
export function spawnSurvival(maxEnergy: number = STAMINA_MAX): SurvivalState {
  return { hunger: HUNGER_MAX, stamina: maxEnergy, staminaGated: false };
}

export function canSprint(state: SurvivalState): boolean {
  return !state.staminaGated && state.stamina > 0;
}

export function canAttack(state: SurvivalState): boolean {
  return !state.staminaGated && state.stamina > 0;
}

export interface SurvivalTickOptions {
  readonly sprinting: boolean;
  /** Difficulty hunger-rate multiplier — 0 (peaceful) disables decay entirely. */
  readonly hungerRateMult?: number;
  /** E1.4b: effective max energy (`STAMINA_MAX * effectiveMaxEnergyMultiplier`).
   *  Defaults to `STAMINA_MAX` — identical to today for a stats-less caller. */
  readonly maxEnergy?: number;
}

function resolveGate(state: SurvivalState, stamina: number, maxEnergy: number): boolean {
  if (stamina <= 0) return true;
  return state.staminaGated && stamina < maxEnergy * STAMINA_GATE_RECOVER_FRAC;
}

/** One frame of passive decay/regen. Sprint drain only applies if sprinting
 *  is both requested AND currently allowed (gated players silently stop
 *  costing stamina, same as if they'd already let off the key). */
export function tickSurvival(
  state: SurvivalState,
  dt: number,
  opts: SurvivalTickOptions,
): SurvivalState {
  const hungerMult = opts.hungerRateMult ?? 1;
  const maxEnergy = opts.maxEnergy ?? STAMINA_MAX;
  const effectiveSprint = opts.sprinting && canSprint(state);

  const hunger = Math.max(
    0,
    Math.min(
      HUNGER_MAX,
      state.hunger -
        dt * hungerMult * (HUNGER_DECAY_PER_S + (effectiveSprint ? HUNGER_SPRINT_EXTRA_PER_S : 0)),
    ),
  );

  const stamina = effectiveSprint
    ? Math.max(0, state.stamina - dt * STAMINA_SPRINT_DRAIN_PER_S)
    : Math.min(maxEnergy, state.stamina + dt * STAMINA_REGEN_PER_S);

  return { hunger, stamina, staminaGated: resolveGate(state, stamina, maxEnergy) };
}

/** Spend stamina+hunger for one attack swing; a no-op if attack is gated.
 *  `maxEnergy` (E1.4b) only affects the post-spend gate threshold — the
 *  attack's stamina/hunger cost itself is flat regardless of max. */
export function drainStaminaForAttack(
  state: SurvivalState,
  maxEnergy: number = STAMINA_MAX,
): SurvivalState {
  if (!canAttack(state)) return state;
  const stamina = Math.max(0, state.stamina - STAMINA_ATTACK_COST);
  const hunger = Math.max(0, state.hunger - HUNGER_ATTACK_COST);
  return { hunger, stamina, staminaGated: resolveGate(state, stamina, maxEnergy) };
}

/** Health lost this tick from starvation; 0 unless hunger is empty. */
export function starvationDamagePerTick(state: SurvivalState, dt: number): number {
  return state.hunger <= 0 ? STARVATION_DAMAGE_PER_S * dt : 0;
}

/** Restore hunger (from eating), capped at max; a no-op for non-positive amounts. */
export function restoreHunger(state: SurvivalState, amount: number): SurvivalState {
  if (amount <= 0) return state;
  return { ...state, hunger: Math.min(HUNGER_MAX, state.hunger + amount) };
}
