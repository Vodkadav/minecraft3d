/**
 * The projectile catalogue (E7.0 combat contracts) — pure data, single
 * source of truth for how a ranged/thrown/spell shot flies. Host-owned
 * simulation (E7.2) steps a live shot against a spec looked up here; joiners
 * render a cosmetic tracer keyed by the same `tracerVfx` id (plan §6). Mirrors
 * `CreatureRegistry`'s fallible-construction pattern (domain/creatures).
 */

import { err, ok, type Result } from "../Result";

export interface ProjectileSpec {
  readonly id: string;
  /** Flight speed, m/s. */
  readonly speed: number;
  /** Downward acceleration, m/s^2 — 0 = straight flight, no arc. */
  readonly gravity: number;
  readonly lifetimeMs: number;
  /** Collision radius, m. */
  readonly radius: number;
  /** Targets it can pass through before expiring; absent = single-target. */
  readonly pierces?: number;
  readonly tracerVfx: string;
}

export type ProjectileError =
  | { readonly kind: "UnknownProjectile"; readonly id: string }
  | { readonly kind: "DuplicateProjectile"; readonly id: string };

export class ProjectileRegistry {
  private constructor(private readonly byId: ReadonlyMap<string, ProjectileSpec>) {}

  static create(specs: readonly ProjectileSpec[]): Result<ProjectileRegistry, ProjectileError> {
    const byId = new Map<string, ProjectileSpec>();
    for (const s of specs) {
      if (byId.has(s.id)) return err({ kind: "DuplicateProjectile", id: s.id });
      byId.set(s.id, s);
    }
    return ok(new ProjectileRegistry(byId));
  }

  get(id: string): Result<ProjectileSpec, ProjectileError> {
    const found = this.byId.get(id);
    if (!found) return err({ kind: "UnknownProjectile", id });
    return ok(found);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly ProjectileSpec[] {
    return [...this.byId.values()];
  }
}

/**
 * Starter table — empty at E7.0 (contracts land first). Each combat stream
 * appends its own entries in its own clearly-labeled section below, so two
 * streams landing in parallel never touch the same lines (mirrors the
 * "append, don't insert" convention from `starterCreatures.ts`/
 * `starterItems.ts`, §4 ownership table).
 */
export const STARTER_PROJECTILES: readonly ProjectileSpec[] = [
  // ---- E7.2 Ranged + ammo (arrows, pebbles, darts) ----
  { id: "arrow", speed: 40, gravity: 9.8, lifetimeMs: 3000, radius: 0.15, tracerVfx: "arrowTracer" },
  { id: "pebble", speed: 30, gravity: 9.8, lifetimeMs: 2000, radius: 0.12, tracerVfx: "pebbleTracer" },
  { id: "dart", speed: 35, gravity: 6, lifetimeMs: 2500, radius: 0.1, tracerVfx: "dartTracer" },
  // ---- E7.3 Spellcasting (Sparkle Bolt) ----
  // Straight flight (no gravity — a magical bolt, not a thrown/drawn shot)
  // and a shorter lifetime than an arrow: Sparkle Bolt is a close-range
  // cozy spark, not a long-range sniping tool.
  { id: "sparkle-bolt", speed: 26, gravity: 0, lifetimeMs: 1800, radius: 0.18, tracerVfx: "sparkleBoltTracer" },
  // ---- E7.6 Monster abilities (ranged spit) ----
];

export const PROJECTILE_REGISTRY: ProjectileRegistry = unwrap(
  ProjectileRegistry.create(STARTER_PROJECTILES),
);

function unwrap(result: Result<ProjectileRegistry, ProjectileError>): ProjectileRegistry {
  if (!result.ok) throw new Error(`bad starter projectile table: ${result.error.kind} (${result.error.id})`);
  return result.value;
}
