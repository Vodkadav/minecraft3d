/**
 * Pure host-owned projectile flight simulation (E7.2 ranged + ammo, ADR 0004
 * §3). No Three.js, no registry coupling — `HostSession` looks up a
 * `ProjectileSpec` (speed/gravity/lifetimeMs/radius) once at launch and steps
 * the returned `ProjectileState` each tick against plain numbers, exactly the
 * same shape `ProjectileEntity` streams to joiners for their cosmetic tracer.
 * Semi-implicit (symplectic) Euler integration — stable and cheap enough for
 * a per-tick host simulation of a handful of slow, arcing cozy projectiles.
 */

export interface ProjectileState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Milliseconds since launch. */
  readonly ageMs: number;
}

/** A unit (or near-unit) direction vector — the wire's `dir` shape reused
 *  here so call sites can pass `AimedAttackMsg.dir` straight through. */
export type Vec3 = readonly [number, number, number];

export function spawnProjectile(origin: Vec3, dir: Vec3, speed: number): ProjectileState {
  return {
    x: origin[0],
    y: origin[1],
    z: origin[2],
    vx: dir[0] * speed,
    vy: dir[1] * speed,
    vz: dir[2] * speed,
    ageMs: 0,
  };
}

export interface StepOutcome {
  readonly state: ProjectileState;
  /** True once `ageMs` reaches `lifetimeMs` — the caller removes it, no
   *  further stepping/collision testing needed this tick. */
  readonly expired: boolean;
}

/** Advance one tick: gravity accelerates `vy` downward first (symplectic
 *  Euler), then position integrates from the UPDATED velocity — the standard
 *  stable-arc integrator for lightweight arcade projectile motion. */
export function stepProjectile(
  state: ProjectileState,
  spec: { readonly gravity: number; readonly lifetimeMs: number },
  dtMs: number,
): StepOutcome {
  const dtSec = Math.max(0, dtMs) / 1000;
  const vy = state.vy - spec.gravity * dtSec;
  const next: ProjectileState = {
    x: state.x + state.vx * dtSec,
    y: state.y + vy * dtSec,
    z: state.z + state.vz * dtSec,
    vx: state.vx,
    vy,
    vz: state.vz,
    ageMs: state.ageMs + Math.max(0, dtMs),
  };
  return { state: next, expired: next.ageMs >= spec.lifetimeMs };
}

export interface HitTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Collision radius, m. */
  readonly radius: number;
}

/** The first target (in iteration order) whose sphere overlaps the
 *  projectile's own collision sphere, or `null`. Pure sphere-sphere test —
 *  no raycast/tunneling correction needed at cozy projectile speeds + tick
 *  rate (recorded deferral, see COMBAT_PLAN's lag-compensation note). */
export function findHit(
  state: ProjectileState,
  projectileRadius: number,
  targets: readonly HitTarget[],
): HitTarget | null {
  for (const t of targets) {
    const dx = state.x - t.x;
    const dy = state.y - t.y;
    const dz = state.z - t.z;
    const reach = projectileRadius + t.radius;
    if (dx * dx + dy * dy + dz * dz <= reach * reach) return t;
  }
  return null;
}

/** A unit-length (or zero-fallback) direction from a velocity vector — used
 *  to orient the cosmetic tracer streamed as `ProjectileEntity.dirX/Y/Z`. */
export function velocityDirection(state: ProjectileState): Vec3 {
  const mag = Math.hypot(state.vx, state.vy, state.vz);
  if (mag < 1e-6) return [0, -1, 0];
  return [state.vx / mag, state.vy / mag, state.vz / mag];
}
