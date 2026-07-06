/**
 * Pure streaming/claim math for the hidden-treasure engine adapter (plan
 * 8.7, [F]). Everything here is renderer-free so the marker lifecycle can be
 * unit-tested exactly: which treasures should exist around the player
 * (domain window minus discovered), the enter/leave diff against the
 * currently-spawned set, the cell-crossing early-out that keeps the streamer
 * off the per-frame hot path, the surface-hover y, and the claim proximity
 * predicate. TreasureField owns the three.js remainder.
 */

import {
  treasuresNear,
  worldToTreasureCell,
  type HiddenTreasure,
  type TreasureTier,
} from "../../game/domain/treasure/HiddenTreasure";
import { isDiscovered, type DiscoveryState } from "../../game/domain/treasure/TreasureDiscovery";

export const DEFAULT_RADIUS_CELLS = 4;
/** Marker hover above the resolved surface — keeps it readable over grass. */
export const MARKER_HOVER_M = 0.6;
/** XZ distance at which walking over a marker claims it. */
export const DISCOVER_RANGE_M = 1.8;

/** Emissive-ish marker color per tier (copper / cyan / gold). */
export const TIER_COLOR: Readonly<Record<TreasureTier, number>> = {
  common: 0xb87333,
  rare: 0x35d0e0,
  legendary: 0xffc94a,
};

/**
 * Early-out key: the desired set only changes when the player enters a new
 * treasure cell, so `update()` skips the whole window scan otherwise.
 * `null` previous cell (first update) always counts as a crossing.
 */
export function crossedTreasureCell(
  lastCx: number | null,
  lastCz: number | null,
  x: number,
  z: number,
): boolean {
  return worldToTreasureCell(x) !== lastCx || worldToTreasureCell(z) !== lastCz;
}

/** The treasures that should have markers: in radius and not yet discovered. */
export function desiredTreasures(
  seed: number,
  x: number,
  z: number,
  radiusCells: number,
  discovered: DiscoveryState,
): HiddenTreasure[] {
  return treasuresNear(seed, x, z, radiusCells).filter((t) => !isDiscovered(discovered, t.id));
}

export interface StreamDiff {
  readonly enter: readonly HiddenTreasure[];
  readonly leave: readonly string[];
}

/** Set-diff by treasure id: what to spawn (enter) and despawn (leave). */
export function diffVisible(
  visible: ReadonlySet<string>,
  desired: readonly HiddenTreasure[],
): StreamDiff {
  const enter = desired.filter((t) => !visible.has(t.id));
  const desiredIds = new Set(desired.map((t) => t.id));
  const leave: string[] = [];
  for (const id of visible) if (!desiredIds.has(id)) leave.push(id);
  return { enter, leave };
}

/** Domain leaves y at 0; the marker floats just above the resolved surface. */
export function markerY(surfaceY: number): number {
  return surfaceY + MARKER_HOVER_M;
}

/** Squared-distance XZ proximity — allocation- and sqrt-free for the frame loop. */
export function withinDiscoveryRange(
  px: number,
  pz: number,
  tx: number,
  tz: number,
  rangeM = DISCOVER_RANGE_M,
): boolean {
  const dx = tx - px;
  const dz = tz - pz;
  return dx * dx + dz * dz <= rangeM * rangeM;
}
