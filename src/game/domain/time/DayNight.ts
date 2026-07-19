/**
 * Day/night threat (Workstream 5.4). `isNight` is a pure predicate over the
 * existing `?T=`/`timeOfDay` hour value (0..24, wraps) — no engine coupling.
 * The multipliers feed into `CreatureBrain.decideBehavior`'s optional
 * `reactRangeMult` param and `SpawnFieldView`'s bite-damage calc as plain
 * config, not a rewrite of either.
 */

export const NIGHT_START_HOUR = 20;
export const NIGHT_END_HOUR = 6;
/** Sleep skips the clock forward to this hour. */
export const MORNING_HOUR = 7;

export const NIGHT_AGGRO_RANGE_MULT = 1.5;
export const NIGHT_DAMAGE_MULT = 1.5;

/** True for hour ∈ [NIGHT_START_HOUR, 24) ∪ [0, NIGHT_END_HOUR); wraps and
 *  clamps any finite hour (including negatives or values ≥ 24) into 0..24. */
export function isNight(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}
