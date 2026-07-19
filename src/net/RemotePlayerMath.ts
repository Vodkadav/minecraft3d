/**
 * Pure math for remote-player avatars (M7.4): a deterministic per-peer color
 * and the exponential pose smoothing the render adapter (RemotePlayers) steps
 * each frame. Kept renderer-free so the interpolation is unit-testable.
 */

import { hash32 } from "../game/domain/rng/hash";

/** Deterministic, well-separated avatar color (24-bit RGB int) per peerId. */
export function colorForPeer(peerId: string): number {
  const h = hash32(...[...peerId].map((c) => c.codePointAt(0) ?? 0));
  const hue = (h % 3600) / 3600;
  return hslToRgbInt(hue, 0.65, 0.55);
}

/**
 * Frame-rate-independent smoothing fraction: the remaining distance halves
 * every `halfLifeS` seconds regardless of frame timing.
 */
export function smoothingFactor(dt: number, halfLifeS = 0.1): number {
  return 1 - Math.pow(0.5, dt / halfLifeS);
}

export function stepToward(
  current: readonly [number, number, number],
  target: readonly [number, number, number],
  k: number,
): [number, number, number] {
  return [
    current[0] + (target[0] - current[0]) * k,
    current[1] + (target[1] - current[1]) * k,
    current[2] + (target[2] - current[2]) * k,
  ];
}

/** Lerp an angle the short way around the circle. */
export function stepYaw(current: number, target: number, k: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * k;
}

/** Clip driven by smoothed horizontal speed (m/s), keyed off FlyCamera's
 *  on-foot walk speed (4.6 m/s) and sprint multiplier (2x). */
export type PlayerClip = "Idle" | "Walking_A" | "Running_A";

const WALK_MIN_MPS = 0.3; // matches FlyCamera's stride-cadence gate
const RUN_MIN_MPS = 6; // between walk (4.6) and sprint (9.2) speeds

export function clipForSpeed(speedMps: number): PlayerClip {
  if (speedMps < WALK_MIN_MPS) return "Idle";
  if (speedMps < RUN_MIN_MPS) return "Walking_A";
  return "Running_A";
}

/** Uniform scale so a model measuring `modelHeightM` renders at `targetHeightM`. */
export function heightScale(modelHeightM: number, targetHeightM: number): number {
  return modelHeightM > 0 ? targetHeightM / modelHeightM : 1;
}

function hslToRgbInt(h: number, s: number, l: number): number {
  const f = (n: number): number => {
    const kk = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(kk - 3, 9 - kk, 1));
  };
  const to255 = (v: number): number => Math.round(v * 255);
  return (to255(f(0)) << 16) | (to255(f(8)) << 8) | to255(f(4));
}
