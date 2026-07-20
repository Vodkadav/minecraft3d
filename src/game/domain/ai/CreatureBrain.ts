/**
 * Creature AI decision core (plan 6.3). Pure: temperament (per species)
 * plus player distance and health fraction decide a behavior; steering
 * turns a behavior into an XZ velocity; wander waypoints are deterministic
 * hashes so peers agree without syncing every stroll. The [F] adapter
 * integrates velocity, resolves ground height, and picks wander epochs.
 */

import { hashUnitFloat } from "../rng/hash";
import { CREATURE_REGISTRY } from "../creatures/CreatureRegistry";
import type { MonsterAbilityCastStyle } from "./CreatureAbilities";

/** E7.6: "cast" holds position (stand-and-cast, or a retreat-and-fire
 *  creature waiting inside its comfortable band); "kite" backs away to
 *  reopen the gap (retreat-and-fire's actual retreat). Both stay within
 *  direct-steering — no navmesh/pathfinding (plan §2's E7.6 constraint). */
export type Behavior = "idle" | "roam" | "flee" | "aggro" | "follow" | "cast" | "kite";

export interface Temperament {
  /** Player distance (m) that triggers the reaction... */
  readonly reactRange: number;
  /** ...which is flee (timid) or aggro (aggressive). */
  readonly aggressive: boolean;
  /** Health fraction below which even an aggressive creature flees. */
  readonly fleeBelowHealth: number;
}

/** Derived from CreatureRegistry (E0.2) — see its doc comment for why this
 *  stays a thin projection instead of a hand-maintained table. */
export const TEMPERAMENT: Readonly<Record<string, Temperament>> = Object.fromEntries(
  CREATURE_REGISTRY.all().map((c) => [c.id, c.temperament]),
);

const ROAM_SPEED = 1.2;
const FLEE_SPEED = 5.5;
const AGGRO_SPEED = 4.0;
const FOLLOW_SPEED = 3.0;
/** E7.6: a controlled retreat (retreat-and-fire) — faster than a roam, but
 *  deliberately slower than a panicked `flee` so it still reads as "kiting
 *  to keep firing", not terror. */
const KITE_SPEED = 3.2;
/** Tamed heel distance — a follower stops here, not on top of the player. */
const HEEL_M = 3;
/** Wander waypoints land within this radius of the creature's spawn anchor. */
export const WANDER_RADIUS_M = 20;
const ARRIVE_M = 0.75;
/** E7.6: a retreat-and-fire creature with no explicit `minRange` keeps this
 *  fraction of its ability range as its comfortable kiting band. */
const DEFAULT_MIN_RANGE_FRACTION = 0.5;

/** E7.6: `CreatureBrain`'s ability-aware overlay, fed by the caller from the
 *  engaging `CreatureAbility` (`SpawnFieldView.stepCreatures` picks the
 *  first ability whose `range` the target is within) — this module only
 *  needs the shape/range, never the ability's own cooldown/windup timing
 *  (that's `CreatureAbilities.tickAbility`'s job, kept separate on purpose). */
export interface AbilityRangeHint {
  readonly castStyle: MonsterAbilityCastStyle;
  readonly range: number;
  readonly minRange?: number;
}

/** `reactRangeMult` widens reaction range (Workstream 5.4 night-threat hook —
 *  fed in as plain config by the caller, e.g. NIGHT_AGGRO_RANGE_MULT); 1 = unchanged.
 *  `ability` (E7.6) is the stand-and-cast / retreat-and-fire overlay: omitted
 *  or out-of-range behaves exactly as before (plain melee `aggro` chase). */
export function decideBehavior(
  species: string,
  playerDistM: number,
  healthFrac: number,
  tamed = false,
  reactRangeMult = 1,
  ability?: AbilityRangeHint | null,
): Behavior {
  if (tamed) return "follow";
  const t = TEMPERAMENT[species];
  if (!t) return "roam";
  if (playerDistM <= t.reactRange * reactRangeMult) {
    if (!t.aggressive || healthFrac < t.fleeBelowHealth) return "flee";
    if (ability && playerDistM <= ability.range) {
      const minRange = ability.minRange ?? ability.range * DEFAULT_MIN_RANGE_FRACTION;
      if (ability.castStyle === "retreatAndFire" && playerDistM < minRange) return "kite";
      return "cast";
    }
    return "aggro";
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
  if (behavior === "idle" || behavior === "cast") return [0, 0];
  const [tx, tz] =
    behavior === "flee" || behavior === "kite"
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
      : behavior === "kite"
        ? KITE_SPEED
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
