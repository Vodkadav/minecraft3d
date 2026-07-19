/**
 * Pure render-side smoothing for the joiner's puppeted creatures (ADR 0003
 * follow-up): the host streams positions at ~10 Hz, which snaps without
 * interpolation. Exponential smoothing (same shape as the remote-player
 * avatar smoothing in `src/net/RemotePlayerMath.ts`, duplicated here rather
 * than imported so `src/game/domain` stays dependency-free of the net/render
 * layers) steps the rendered transform a fraction of the remaining distance
 * toward the latest snapshot each frame, closing the gap smoothly between
 * snapshots instead of teleporting on arrival.
 */

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
