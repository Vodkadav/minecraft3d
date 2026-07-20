/**
 * Shared AoE resolver (E7.4) — the one radius/falloff primitive every blast
 * source resolves through: thrown bombs (this slice), spell AoEs (E7.3),
 * deployables (E7.5), and monster stomps (E7.6). Pure and host-only — per
 * ADR 0004 §2 only the host ever names a damage number, so only the host
 * calls `resolveAoe`; it multiplies its own damage/healing amount by each
 * hit's `magnitude` and then emits the cosmetic `effect` wire message. A
 * joiner never calls this — it only renders the `effect` message's VFX via
 * `AoeRegistry.get(effectId)`.
 */

import type { AoeSpec } from "./AoeRegistry";
import { err, ok, type Result } from "../Result";

export interface AoePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Anything a blast can hit — an id plus a world position. */
export interface AoeTarget extends AoePoint {
  readonly id: string;
}

export interface AoeHit {
  readonly id: string;
  /** Straight-line 3D distance from the blast center, m. */
  readonly distance: number;
  /** Falloff-scaled multiplier, 1 at center down to 0 at `spec.radius`
   *  (falloff "none" holds 1 everywhere inside the radius). The caller
   *  multiplies its own damage/healing/knockback amount by this — the
   *  resolver never invents an amount itself. */
  readonly magnitude: number;
}

export type AoeResolveError =
  | { readonly kind: "InvalidCenter" }
  | { readonly kind: "InvalidRadius" };

function isFinitePoint(p: AoePoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/**
 * Which of `targets` fall within `spec.radius` of `center`, each with a
 * falloff-scaled magnitude, sorted by ascending distance (so "nearest N"
 * callers can just slice). A target with a non-finite position is skipped
 * rather than failing the whole batch — one bad entity never kills the
 * resolve. A non-finite center or non-positive radius is a caller bug and
 * fails the whole call.
 */
export function resolveAoe(
  spec: AoeSpec,
  center: AoePoint,
  targets: readonly AoeTarget[],
): Result<readonly AoeHit[], AoeResolveError> {
  if (!isFinitePoint(center)) return err({ kind: "InvalidCenter" });
  if (!(spec.radius > 0)) return err({ kind: "InvalidRadius" });

  const hits: AoeHit[] = [];
  for (const t of targets) {
    if (!isFinitePoint(t)) continue;
    const dx = t.x - center.x;
    const dy = t.y - center.y;
    const dz = t.z - center.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > spec.radius) continue;
    const magnitude = spec.falloff === "none" ? 1 : Math.max(0, 1 - distance / spec.radius);
    hits.push({ id: t.id, distance, magnitude });
  }
  hits.sort((a, b) => a.distance - b.distance);
  return ok(hits);
}
