/**
 * Pure host-owned arm/trigger state machine for mines/traps/grenades (E7.5
 * deployables, ADR 0004 §3). No Three.js, no registry coupling beyond the
 * `DeployableSpec` shape — `HostSession` looks up a spec once at placement
 * and steps the returned `DeployableInstance` each tick against plain
 * numbers/positions, exactly the same "host simulates, joiner mirrors"
 * pattern `Projectile.ts` uses for ranged shots. The actual blast is NOT
 * this module's job: once `state` reaches "triggered", the caller resolves
 * the hit through the shared `resolveAoe` (Aoe.ts) using the spec's `aoe` id
 * — this file only decides WHEN that happens.
 *
 * States: arming (safety/telegraph window right after placement) -> armed
 * (trigger-ready) -> triggered (terminal, one-shot). A "timed" spec (a
 * grenade's fuse) skips the "armed" wait entirely — it triggers the instant
 * `armDelayMs` elapses, no nearby entity required. "proximity"/"stepped"
 * specs stay armed until some entity comes within `spec.triggerRadius`.
 */

import type { DeployableSpec } from "./DeployableRegistry";

export type DeployableState = "arming" | "armed" | "triggered";

export interface DeployablePosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DeployableInstance extends DeployablePosition {
  readonly id: string;
  /** DeployableRegistry id — resolves the spec every step against. */
  readonly deployableId: string;
  readonly ownerId: string;
  readonly state: DeployableState;
  /** Milliseconds since placement. */
  readonly elapsedMs: number;
}

/** A host-authoritative candidate to test against `triggerRadius` — the
 *  caller supplies ONLY its own live entity set (never a client-sized/
 *  client-supplied collection, per ADR 0004 §2/plan §6). */
export interface NearbyEntity extends DeployablePosition {
  readonly id: string;
}

export function spawnDeployable(
  id: string,
  deployableId: string,
  ownerId: string,
  position: DeployablePosition,
): DeployableInstance {
  return {
    id,
    deployableId,
    ownerId,
    x: position.x,
    y: position.y,
    z: position.z,
    state: "arming",
    elapsedMs: 0,
  };
}

function withinTriggerRadius(
  instance: DeployablePosition,
  spec: DeployableSpec,
  nearby: readonly NearbyEntity[],
): boolean {
  for (const e of nearby) {
    const dx = e.x - instance.x;
    const dy = e.y - instance.y;
    const dz = e.z - instance.z;
    if (Math.hypot(dx, dy, dz) <= spec.triggerRadius) return true;
  }
  return false;
}

/** Advance one tick. A "triggered" instance is terminal and is returned
 *  unchanged (idempotent — the caller removes it once it observes the
 *  transition, mirroring `Projectile.ts`'s expired-shot contract). */
export function stepDeployable(
  instance: DeployableInstance,
  spec: DeployableSpec,
  dtMs: number,
  nearby: readonly NearbyEntity[],
): DeployableInstance {
  if (instance.state === "triggered") return instance;

  const elapsedMs = instance.elapsedMs + Math.max(0, dtMs);

  if (instance.state === "arming") {
    if (elapsedMs < spec.armDelayMs) return { ...instance, elapsedMs };
    // The arm delay just elapsed this tick. A timed fuse (grenade) goes off
    // the instant it arms — no nearby check needed. Proximity/stepped specs
    // become armed and fall through to the same trigger check "armed" gets.
    if (spec.trigger === "timed") return { ...instance, elapsedMs, state: "triggered" };
    const armed: DeployableInstance = { ...instance, elapsedMs, state: "armed" };
    return withinTriggerRadius(armed, spec, nearby) ? { ...armed, state: "triggered" } : armed;
  }

  // state === "armed": timed specs never linger here (they trigger on arm
  // above), so this only ever runs for proximity/stepped.
  return withinTriggerRadius(instance, spec, nearby)
    ? { ...instance, elapsedMs, state: "triggered" }
    : { ...instance, elapsedMs };
}
