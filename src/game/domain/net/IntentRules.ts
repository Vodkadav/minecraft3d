/**
 * Host-side intent sanity checks (ADR 0002 §6 — "client sends intent, host
 * resolves outcome"). The host never trusts a joiner's claimed movement or
 * edit: a pose that implies teleporting and a dig outside sane bounds are
 * silently dropped. These are pure predicates so the host session stays
 * trivially testable.
 */

import type { PlayerState } from "../world/WorldSaveData";

/** Generous sprint+knockback ceiling; anything faster is a teleport. */
const MAX_HORIZONTAL_SPEED = 20; // m/s
/** Falling is legitimately fast; still bounded to reject vertical warps. */
const MAX_VERTICAL_SPEED = 80; // m/s
const MAX_DIG_RADIUS = 4;

function isFinitePose(p: PlayerState): boolean {
  return (
    p.position.length === 3 &&
    p.position.every(Number.isFinite) &&
    Number.isFinite(p.yaw) &&
    Number.isFinite(p.pitch)
  );
}

/**
 * Accept `next` given the last accepted pose `prev` and the elapsed time.
 * First pose (prev null) only needs to be finite. Movement with dtMs <= 0 is
 * infinite speed and rejected; standing still is always fine.
 */
export function validatePose(
  prev: PlayerState | null,
  next: PlayerState,
  dtMs: number,
): boolean {
  if (!isFinitePose(next)) return false;
  if (prev === null) return true;
  if (!Number.isFinite(dtMs)) return false;
  const dx = next.position[0] - prev.position[0];
  const dy = next.position[1] - prev.position[1];
  const dz = next.position[2] - prev.position[2];
  if (dx === 0 && dy === 0 && dz === 0) return true;
  if (dtMs <= 0) return false;
  const dtSec = dtMs / 1000;
  return (
    Math.hypot(dx, dz) <= MAX_HORIZONTAL_SPEED * dtSec &&
    Math.abs(dy) <= MAX_VERTICAL_SPEED * dtSec
  );
}

/** A dig/fill intent is sane: finite coords, radius in (0, 4]. */
export function validateDig(x: number, y: number, z: number, radius: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z) &&
    Number.isFinite(radius) &&
    radius > 0 &&
    radius <= MAX_DIG_RADIUS
  );
}
