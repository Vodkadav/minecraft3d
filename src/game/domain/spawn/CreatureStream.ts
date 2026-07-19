/**
 * Pure joiner-side reconciler (ADR 0003). The host streams its full active
 * spawn-field set each tick; diffing it against the ids the joiner currently
 * shows yields the three renderer actions — materialize (add), move (update),
 * despawn (remove) — with no engine dependency, so it is unit-tested directly.
 */

import type { CreatureEntity } from "../net/Protocol";

export interface EntityReconcile {
  /** Ids in the snapshot the joiner does not yet show. */
  readonly add: readonly CreatureEntity[];
  /** Ids the joiner already shows — apply the fresh transform. */
  readonly update: readonly CreatureEntity[];
  /** Ids the joiner shows that the snapshot dropped (despawn/kill, no clip). */
  readonly remove: readonly string[];
  /** Entities newly marked `dying: true` this snapshot — play the death clip
   *  once, then let the entity ride out its remaining ticks as an `update`
   *  until the host actually drops it (a `remove`). */
  readonly died: readonly CreatureEntity[];
}

export function reconcileEntities(
  prevIds: Iterable<string>,
  snapshot: readonly CreatureEntity[],
  prevDyingIds: ReadonlySet<string> = new Set(),
): EntityReconcile {
  const prev = new Set(prevIds);
  const add: CreatureEntity[] = [];
  const update: CreatureEntity[] = [];
  const died: CreatureEntity[] = [];
  const live = new Set<string>();
  for (const e of snapshot) {
    live.add(e.id);
    (prev.has(e.id) ? update : add).push(e);
    if (e.dying && !prevDyingIds.has(e.id)) died.push(e);
  }
  const remove = [...prev].filter((id) => !live.has(id));
  return { add, update, remove, died };
}
