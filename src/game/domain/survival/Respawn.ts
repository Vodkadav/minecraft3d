/**
 * Sleep & respawn domain (Workstream 5.3). A bed hasn't landed yet (arrives
 * in Workstream 7); `setSpawnPoint` is the seam a future placed-bed feature
 * calls into unchanged — for now the composition layer calls it whenever the
 * player sleeps or first spawns. Death-penalty is a pure transform over raw
 * inventory slots (not the `Inventory` class) so it has zero dependency on
 * the registry and composes trivially with `Inventory.fromSlots`.
 */

import type { Slot } from "../inventory/Inventory";

export type DeathPenalty = "keep-inventory" | "drop-hotbar" | "drop-all";

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Pure setter — kept as a function (not a raw assignment) so the seam a
 *  future bed-placement feature calls into is stable and independently
 *  testable, and so a later version can add validation (e.g. reject NaN)
 *  without touching every call site. */
export function setSpawnPoint(_current: SpawnPoint | null, next: SpawnPoint): SpawnPoint {
  return next;
}

/** Applies a death penalty to a raw slot array. `keep-inventory` returns the
 *  same array reference (cheap identity check for callers that want to skip
 *  a rebuild); the others clear the affected slots. */
export function dropOnDeath(
  slots: readonly Slot[],
  hotbarSize: number,
  penalty: DeathPenalty,
): readonly Slot[] {
  if (penalty === "keep-inventory") return slots;
  if (penalty === "drop-all") return slots.map(() => null);
  return slots.map((s, i) => (i < hotbarSize ? null : s));
}
