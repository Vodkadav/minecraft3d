/**
 * Domain time-of-day clock (Workstream E0.3). Pure: accumulates elapsed
 * seconds into a normalized 0..24 hour given a configurable full-day length,
 * and derives `isNight` (reusing `DayNight.isNight` — the SAME predicate that
 * already drives `NIGHT_AGGRO_RANGE_MULT` creature aggro, kept as the single
 * source of truth) plus a coarse dawn/day/dusk/night `phase` for presentation.
 *
 * The engine's sky (`src/sky/SunSky.ts`) owns its own static `timeOfDay` set
 * at boot; this clock does not replace it — an application-layer seam feeds
 * this clock's hour into the engine's existing `hooks.setTimeOfDay` write
 * seam every frame (see `application/WorldClockService.ts`).
 */

import { NIGHT_END_HOUR, NIGHT_START_HOUR, isNight } from "./DayNight";

/** Minecraft-paced default: a full day/night cycle every 20 minutes. */
export const DEFAULT_DAY_LENGTH_SECONDS = 1200;

export const DAY_LENGTH_MIN_SECONDS = 60;
export const DAY_LENGTH_MAX_SECONDS = 7200;

/** Hours either side of the night boundary rendered as a dawn/dusk transition. */
const TWILIGHT_SPAN_HOURS = 2;

export type ClockPhase = "dawn" | "day" | "dusk" | "night";

export interface WorldClock {
  /** Hour of day, always normalized into [0, 24). */
  readonly hour: number;
}

function normalizeHour(hour: number): number {
  const h = hour % 24;
  return h < 0 ? h + 24 : h;
}

/** `startHour` may be any finite number (including negative/≥24) — normalized. */
export function createWorldClock(startHour = 11): WorldClock {
  return { hour: normalizeHour(startHour) };
}

/**
 * Advance the clock by `dtSeconds` given a full day's length in seconds.
 * A non-finite/non-positive `dayLengthSeconds` is a caller bug (Settings
 * validates this before it ever reaches here) — the clock is left unchanged
 * rather than dividing by zero/NaN.
 */
export function tickWorldClock(
  clock: WorldClock,
  dtSeconds: number,
  dayLengthSeconds: number,
): WorldClock {
  if (!Number.isFinite(dayLengthSeconds) || dayLengthSeconds <= 0 || dtSeconds === 0) {
    return clock;
  }
  const hoursPerSecond = 24 / dayLengthSeconds;
  return { hour: normalizeHour(clock.hour + dtSeconds * hoursPerSecond) };
}

/** Reuses `DayNight.isNight` — the exact predicate creature AI already reacts to. */
export function worldClockIsNight(clock: WorldClock): boolean {
  return isNight(clock.hour);
}

export function worldClockPhase(clock: WorldClock): ClockPhase {
  const h = clock.hour;
  if (h >= NIGHT_END_HOUR && h < NIGHT_END_HOUR + TWILIGHT_SPAN_HOURS) return "dawn";
  if (h >= NIGHT_START_HOUR - TWILIGHT_SPAN_HOURS && h < NIGHT_START_HOUR) return "dusk";
  return isNight(h) ? "night" : "day";
}
