/**
 * Pure decay/stacking rules for accumulated feel state (Workstream 2.1). A
 * `FeelState` is threaded frame-to-frame by the presentation adapter
 * (src/feel/FeelDirector.ts) exactly like domain/audio's CooldownState:
 * `applyFeedback` folds a fired event's bundle in, `tickFeel` advances time.
 *
 * Stacking rules:
 *  - shake trauma SUMS across simultaneous hits but clamps at 1 (a wall of
 *    hits never shakes harder than the max) and decays linearly over time.
 *  - hit-stop does NOT stack additively — a second impact during an active
 *    hit-stop only refreshes it up to a hard cap, so chained kills can't
 *    freeze the game.
 *  - vignette pulses are a list (hurt/heal can coexist, e.g. lifesteal) each
 *    aging out independently on a fixed lifetime.
 */

import type { FeedbackBundle } from "./FeelEvents";

/** Trauma decays to 0 in well under a second — shake reads as a snap, not a wobble. */
const TRAUMA_DECAY_PER_S = 1.2;
/** Hit-stop never stacks past this, however many impacts land in one frame. */
export const HIT_STOP_CAP_MS = 150;
/** How long a single vignette pulse stays alive before it's dropped. */
export const VIGNETTE_PULSE_LIFE_S = 0.6;

export interface VignettePulse {
  readonly kind: "hurt" | "heal";
  readonly intensity: number;
  readonly ageS: number;
}

export interface FeelState {
  /** 0..1 shake pool; presentation reads magnitude as trauma^2 (see FeelDirector). */
  readonly trauma: number;
  /** Remaining presentation-time-dip window, ms. */
  readonly hitStopMs: number;
  readonly vignettePulses: readonly VignettePulse[];
}

export function emptyFeelState(): FeelState {
  return { trauma: 0, hitStopMs: 0, vignettePulses: [] };
}

/** Fold a fired event's bundle into the running state. */
export function applyFeedback(state: FeelState, bundle: FeedbackBundle): FeelState {
  const trauma = Math.min(1, state.trauma + bundle.shakeTrauma);
  const hitStopMs = Math.min(HIT_STOP_CAP_MS, Math.max(state.hitStopMs, bundle.hitStopMs));
  const vignettePulses = bundle.vignette
    ? [...state.vignettePulses, { kind: bundle.vignette.kind, intensity: bundle.vignette.intensity, ageS: 0 }]
    : state.vignettePulses;
  return { trauma, hitStopMs, vignettePulses };
}

/** Advance decay by `dt` seconds. Called every frame of every real game boot
 *  (FeelDirector.tick) regardless of whether anything is actually happening
 *  — the idle case (nothing decaying, no pulses) is by far the most common,
 *  so it returns the SAME state reference with zero allocation instead of
 *  running `.map().filter()` over an empty array 60 times a second
 *  (Workstream 9.1 GC-hitch audit finding). */
export function tickFeel(state: FeelState, dt: number): FeelState {
  if (state.trauma === 0 && state.hitStopMs === 0 && state.vignettePulses.length === 0) {
    return state;
  }
  const trauma = Math.max(0, state.trauma - TRAUMA_DECAY_PER_S * dt);
  const hitStopMs = Math.max(0, state.hitStopMs - dt * 1000);
  const vignettePulses =
    state.vignettePulses.length === 0
      ? state.vignettePulses
      : state.vignettePulses
          .map((p) => ({ ...p, ageS: p.ageS + dt }))
          .filter((p) => p.ageS < VIGNETTE_PULSE_LIFE_S);
  return { trauma, hitStopMs, vignettePulses };
}

/** Punchier falloff than linear trauma — the standard game-feel shake curve. */
export function shakeMagnitude(state: FeelState): number {
  return state.trauma * state.trauma;
}

/** A pulse's current intensity, faded linearly over its lifetime; 0 once dead. */
export function pulseIntensity(pulse: VignettePulse): number {
  const t = 1 - pulse.ageS / VIGNETTE_PULSE_LIFE_S;
  return t > 0 ? pulse.intensity * t : 0;
}
