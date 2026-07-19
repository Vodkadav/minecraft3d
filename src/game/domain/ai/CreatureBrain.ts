/**
 * Creature AI decision core (plan 6.3). Pure: temperament (per species)
 * plus player distance and health fraction decide a behavior; steering
 * turns a behavior into an XZ velocity; wander waypoints are deterministic
 * hashes so peers agree without syncing every stroll. The [F] adapter
 * integrates velocity, resolves ground height, and picks wander epochs.
 */

import { hashUnitFloat } from "../rng/hash";

export type Behavior = "idle" | "roam" | "flee" | "aggro" | "follow";

export interface Temperament {
  /** Player distance (m) that triggers the reaction... */
  readonly reactRange: number;
  /** ...which is flee (timid) or aggro (aggressive). */
  readonly aggressive: boolean;
  /** Health fraction below which even an aggressive creature flees. */
  readonly fleeBelowHealth: number;
}

export const TEMPERAMENT: Readonly<Record<string, Temperament>> = {
  deer: { reactRange: 18, aggressive: false, fleeBelowHealth: 1 },
  wolf: { reactRange: 14, aggressive: true, fleeBelowHealth: 0.3 },

  // ---- Workstream 7.2 creature variety ----
  elk: { reactRange: 16, aggressive: false, fleeBelowHealth: 1 },
  fox: { reactRange: 20, aggressive: false, fleeBelowHealth: 1 },
  boar: { reactRange: 10, aggressive: true, fleeBelowHealth: 0.2 },
  rabbit: { reactRange: 22, aggressive: false, fleeBelowHealth: 1 },
};

const ROAM_SPEED = 1.2;
const FLEE_SPEED = 5.5;
const AGGRO_SPEED = 4.0;
const FOLLOW_SPEED = 3.0;
/** Tamed heel distance — a follower stops here, not on top of the player. */
const HEEL_M = 3;
/** Wander waypoints land within this radius of the creature's spawn anchor. */
export const WANDER_RADIUS_M = 20;
const ARRIVE_M = 0.75;

/** `reactRangeMult` widens reaction range (Workstream 5.4 night-threat hook —
 *  fed in as plain config by the caller, e.g. NIGHT_AGGRO_RANGE_MULT); 1 = unchanged. */
export function decideBehavior(
  species: string,
  playerDistM: number,
  healthFrac: number,
  tamed = false,
  reactRangeMult = 1,
): Behavior {
  if (tamed) return "follow";
  const t = TEMPERAMENT[species];
  if (!t) return "roam";
  if (playerDistM <= t.reactRange * reactRangeMult) {
    return t.aggressive && healthFrac >= t.fleeBelowHealth ? "aggro" : "flee";
  }
  return "roam";
}

/** XZ velocity for one behavior; [0,0] means hold still. */
export function steer(
  behavior: Behavior,
  pos: readonly [number, number],
  player: readonly [number, number],
  waypoint: readonly [number, number],
): [number, number] {
  if (behavior === "idle") return [0, 0];
  const [tx, tz] =
    behavior === "flee"
      ? [pos[0] * 2 - player[0], pos[1] * 2 - player[1]]
      : behavior === "aggro" || behavior === "follow"
        ? player
        : waypoint;
  const dx = tx - pos[0];
  const dz = tz - pos[1];
  const d = Math.hypot(dx, dz);
  if (d < (behavior === "follow" ? HEEL_M : ARRIVE_M)) return [0, 0];
  const speed =
    behavior === "flee"
      ? FLEE_SPEED
      : behavior === "aggro"
        ? AGGRO_SPEED
        : behavior === "follow"
          ? FOLLOW_SPEED
          : ROAM_SPEED;
  return [(dx / d) * speed, (dz / d) * speed];
}

const WANDER_X_SALT = 0x6100;
const WANDER_Z_SALT = 0x6200;

/** Deterministic stroll target near the anchor for this wander epoch. */
export function wanderWaypoint(
  id: string,
  anchor: readonly [number, number],
  epoch: number,
): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const ang = hashUnitFloat(h, epoch, WANDER_X_SALT) * Math.PI * 2;
  const r = hashUnitFloat(h, epoch, WANDER_Z_SALT) * WANDER_RADIUS_M;
  return [anchor[0] + Math.cos(ang) * r, anchor[1] + Math.sin(ang) * r];
}
