/**
 * Workbench placeable proximity (Workstream 8.1) — unlocks higher crafting
 * tiers while the player stands near a placed workbench. Pure distance
 * predicate + tier resolution; the crafting UI composes it instead of a
 * hardcoded unlockedTier (closes the S4 deferral note).
 */

export const WORKBENCH_RADIUS_M = 4;
export const WORKBENCH_UNLOCK_TIER = 2;

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function withinRadius(
  from: Point3,
  points: readonly Point3[],
  radius: number,
): boolean {
  return points.some((p) => {
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const dz = p.z - from.z;
    return Math.hypot(dx, dy, dz) <= radius;
  });
}

export function isNearWorkbench(
  player: Point3,
  workbenches: readonly Point3[],
  radius: number = WORKBENCH_RADIUS_M,
): boolean {
  return withinRadius(player, workbenches, radius);
}

/** The effective unlocked tier: at least the base tier, bumped to the
 *  workbench tier while standing near one (never LOWERS the base tier). */
export function resolveUnlockedTier(baseTier: number, nearWorkbench: boolean): number {
  return nearWorkbench ? Math.max(baseTier, WORKBENCH_UNLOCK_TIER) : baseTier;
}
