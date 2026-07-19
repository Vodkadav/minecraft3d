/**
 * Ground-drop loot entity (E0.5) — a dropped stack sitting in the world.
 * Loot used to be returned as an `ItemStack[]` a caller granted directly
 * (`Combat.lootFor` → `GameHud.addLoot`); a `GroundItem` is the same stack
 * given a place, an id, and an optional despawn clock instead of being
 * auto-granted. Pure and immutable — spawn source (creature death, node
 * harvest overflow, player drop) and pickup resolution are the [O]/[F]
 * seams (`HostSession`, `src/spawn/GroundItemField.ts`).
 */

export interface GroundItem {
  readonly id: string;
  readonly itemId: string;
  readonly count: number;
  readonly position: readonly [number, number, number];
  readonly spawnedAtMs: number;
  /** Undefined = never despawns on its own (still removable by pickup). */
  readonly despawnAfterMs?: number;
}

export interface SpawnGroundItemArgs {
  readonly id: string;
  readonly itemId: string;
  readonly count: number;
  readonly position: readonly [number, number, number];
  readonly spawnedAtMs: number;
  readonly despawnAfterMs?: number;
}

export function spawnGroundItem(args: SpawnGroundItemArgs): GroundItem {
  return {
    id: args.id,
    itemId: args.itemId,
    count: args.count,
    position: args.position,
    spawnedAtMs: args.spawnedAtMs,
    ...(args.despawnAfterMs !== undefined ? { despawnAfterMs: args.despawnAfterMs } : {}),
  };
}

/** True once `nowMs` reaches the item's despawn deadline; always false for an
 *  item with no despawn timer. */
export function isExpired(item: GroundItem, nowMs: number): boolean {
  if (item.despawnAfterMs === undefined) return false;
  return nowMs - item.spawnedAtMs >= item.despawnAfterMs;
}

/** Deterministic id for one stack of a drop event — same source+item+index
 *  always yields the same id (mirrors `CreatureEntity` ids being derived from
 *  the deterministic spawn hash), so a rebuilt/replayed drop stays stable. */
export function groundItemId(sourceId: string, itemId: string, index: number): string {
  return `loot:${sourceId}:${itemId}:${index}`;
}
