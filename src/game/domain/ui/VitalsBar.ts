/**
 * Pure bar-value math for the vitals cluster (Workstream 3, task 3.4):
 * a frame-rate-independent tween toward a target fraction (same exponential
 * half-life shape as the creature-stream smoothing, reused rather than
 * duplicated), and the low-value pulse threshold. No DOM, no motion-pref
 * knowledge — the component decides whether to honor prefers-reduced-motion.
 */

import { smoothingFactor } from "../spawn/CreatureSmoothing";

export const VITAL_CRITICAL_THRESHOLD = 0.25;
/** Below this remaining gap, snap straight to the target instead of tweening forever. */
const SNAP_EPSILON = 0.002;

export function clampFraction(fraction: number): number {
  return Math.max(0, Math.min(1, fraction));
}

/** Steps `current` a fraction of the remaining distance toward `target`. */
export function stepVitalFill(
  current: number,
  target: number,
  dt: number,
  halfLifeS = 0.15,
): number {
  const clampedTarget = clampFraction(target);
  const k = smoothingFactor(dt, halfLifeS);
  const next = current + (clampedTarget - current) * k;
  return Math.abs(next - clampedTarget) < SNAP_EPSILON ? clampedTarget : next;
}

/** A vital pulses (visual urgency) once it's above zero but at/below the critical threshold. */
export function isVitalCritical(fraction: number): boolean {
  return fraction > 0 && fraction <= VITAL_CRITICAL_THRESHOLD;
}
