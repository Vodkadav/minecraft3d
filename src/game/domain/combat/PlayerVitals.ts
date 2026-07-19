/**
 * Player vitals (M6 player health). Pure health state for the local player:
 * damage with a single death event, and gentle full-heal regen after a grace
 * period. Family game (ADR audience ~11 yo): death respawns you at full with
 * no item loss — the sting is losing your spot, not your progress. Respawn
 * reposition + the wolf-contact damage seam are the engine [F] half.
 */

export const PLAYER_MAX_HEALTH = 100;
/** Seconds without taking a hit before health starts recovering. */
export const REGEN_DELAY_S = 5;
/** Health recovered per second once regen kicks in. */
export const REGEN_PER_S = 15;

export interface PlayerVitals {
  readonly health: number;
  readonly dead: boolean;
  /** Seconds since the last hit landed — gates regen. */
  readonly sinceHitS: number;
}

/** `maxHealth` defaults to `PLAYER_MAX_HEALTH` — a stats-less caller (or the
 *  multiplier defaulting to 1, see `character/Character.ts`) behaves exactly
 *  as before E1.4b. */
export function spawnPlayerVitals(maxHealth: number = PLAYER_MAX_HEALTH): PlayerVitals {
  return { health: maxHealth, dead: false, sinceHitS: REGEN_DELAY_S };
}

export interface PlayerDamageResult {
  readonly state: PlayerVitals;
  /** True exactly once — on the hit that brings health to zero. */
  readonly died: boolean;
}

export function damagePlayer(state: PlayerVitals, amount: number): PlayerDamageResult {
  if (amount <= 0 || state.dead) return { state, died: false };
  const health = Math.max(0, state.health - amount);
  const dead = health === 0;
  return { state: { health, dead, sinceHitS: 0 }, died: dead };
}

export function tickVitals(
  state: PlayerVitals,
  dt: number,
  maxHealth: number = PLAYER_MAX_HEALTH,
): PlayerVitals {
  if (state.dead || state.health >= maxHealth) return state;
  const sinceHitS = state.sinceHitS + dt;
  if (sinceHitS < REGEN_DELAY_S) return { ...state, sinceHitS };
  // only the time past the grace threshold heals
  const healingS = Math.min(dt, sinceHitS - REGEN_DELAY_S);
  const health = Math.min(maxHealth, state.health + healingS * REGEN_PER_S);
  return { ...state, health, sinceHitS };
}

export function respawnPlayer(
  _state: PlayerVitals,
  maxHealth: number = PLAYER_MAX_HEALTH,
): PlayerVitals {
  return spawnPlayerVitals(maxHealth);
}
