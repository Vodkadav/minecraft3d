/**
 * Door/gate placeable domain (Workstream 8.1) — an open/closed toggle with an
 * optional owner lock. Locking is opt-in (`setLocked`); a locked door only
 * yields to its owner, an unlocked one opens for anyone. Pure state machine —
 * mutated only through the host-authoritative intent path (Protocol
 * `placeableInteract` action "toggleDoor"); joiners never flip this locally.
 */

import { err, ok, type Result } from "../Result";

export interface DoorState {
  readonly open: boolean;
  readonly ownerId: string | null;
  readonly locked: boolean;
}

export type DoorError = { readonly kind: "Locked" };

export function spawnDoor(ownerId: string | null = null): DoorState {
  return { open: false, ownerId, locked: false };
}

/** Only the owner may change the lock; an ownerless door has nobody to ask, so
 *  its lock is permanently off (setLocked(true) always rejects). */
export function setLocked(
  state: DoorState,
  locked: boolean,
  requesterId: string,
): Result<DoorState, DoorError> {
  if (state.ownerId === null || state.ownerId !== requesterId) {
    return err({ kind: "Locked" });
  }
  return ok({ ...state, locked });
}

/** Toggles open/closed. A locked door only yields to its owner. */
export function toggleDoor(state: DoorState, requesterId: string): Result<DoorState, DoorError> {
  if (state.locked && state.ownerId !== null && state.ownerId !== requesterId) {
    return err({ kind: "Locked" });
  }
  return ok({ ...state, open: !state.open });
}
