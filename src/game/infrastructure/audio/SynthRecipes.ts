/**
 * Pure procedural-synthesis parameters for each AudioEventId (Workstream 1.5).
 * No Web Audio here — this is plain data + arithmetic the adapter turns into
 * oscillator/noise nodes; kept separate and pure so it's unit-testable
 * without an AudioContext (which vitest's node/happy-dom environments don't
 * implement).
 *
 * Two synth kinds cover the whole kit:
 *  - "tone": one or two oscillators sweeping freqStartHz -> freqEndHz over
 *    durationS, useful for hits/hurts/UI blips/tame chimes.
 *  - "noise": a filtered noise burst, useful for footsteps/dig/harvest/wind.
 */

import type { AudioEventId } from "../../domain/audio/AudioEvents";

export type OscType = "sine" | "square" | "sawtooth" | "triangle";

export interface ToneRecipe {
  readonly kind: "tone";
  readonly type: OscType;
  readonly freqStartHz: number;
  readonly freqEndHz: number;
  readonly durationS: number;
}

export interface NoiseRecipe {
  readonly kind: "noise";
  readonly durationS: number;
  /** Lowpass filter cutoff — lower = duller/thuddier, higher = crisper/hissier. */
  readonly filterHz: number;
}

export type SynthRecipe = ToneRecipe | NoiseRecipe;

const RECIPES: Record<AudioEventId, SynthRecipe> = {
  footstep: { kind: "noise", durationS: 0.08, filterHz: 900 },
  dig: { kind: "noise", durationS: 0.14, filterHz: 500 },
  place: { kind: "noise", durationS: 0.1, filterHz: 1400 },
  harvest: { kind: "noise", durationS: 0.12, filterHz: 2200 },
  craft: { kind: "tone", type: "triangle", freqStartHz: 440, freqEndHz: 660, durationS: 0.18 },
  hit: { kind: "tone", type: "square", freqStartHz: 220, freqEndHz: 90, durationS: 0.1 },
  hurt: { kind: "tone", type: "sawtooth", freqStartHz: 300, freqEndHz: 120, durationS: 0.22 },
  tame: { kind: "tone", type: "sine", freqStartHz: 520, freqEndHz: 880, durationS: 0.3 },
  eat: { kind: "noise", durationS: 0.16, filterHz: 1200 },
  sleep: { kind: "tone", type: "sine", freqStartHz: 440, freqEndHz: 220, durationS: 0.9 },
  uiClick: { kind: "tone", type: "square", freqStartHz: 900, freqEndHz: 900, durationS: 0.03 },
  uiHover: { kind: "tone", type: "sine", freqStartHz: 700, freqEndHz: 700, durationS: 0.02 },
  ambientWind: { kind: "noise", durationS: 4, filterHz: 350 },
  musicCalm: { kind: "tone", type: "sine", freqStartHz: 261.6, freqEndHz: 261.6, durationS: 2 },
};

export function synthRecipeFor(id: AudioEventId): SynthRecipe {
  return RECIPES[id];
}

/** Linear-ramp envelope breakpoints (attack -> sustain -> release), as
 *  absolute AudioContext times, given a start time and a target peak gain. */
export interface EnvelopeTimes {
  readonly startTime: number;
  readonly attackEndTime: number;
  readonly releaseEndTime: number;
  readonly peak: number;
}

export function envelopeTimes(
  now: number,
  durationS: number,
  peak: number,
  attackS = 0.01,
): EnvelopeTimes {
  const attackEndTime = now + Math.min(attackS, durationS / 2);
  const releaseEndTime = now + durationS;
  return { startTime: now, attackEndTime, releaseEndTime, peak };
}
