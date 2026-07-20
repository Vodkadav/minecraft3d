/**
 * Cozy-whimsical spell resolution (E7.3, ADR 0004 §2/§5) — the pure glue
 * between an `AbilitySpec` (AbilityRegistry.ts) and the shared `resolveAoe`
 * primitive (Aoe.ts, E7.4). No Three.js, host-only: HostSession.handleCastSpell
 * is the sole caller (a joiner never resolves its own cast). Sparkle Bolt's
 * "projectile" targeting deliberately has no function here — it reuses the
 * same host-simulated `Projectile.ts` flow as ranged weapons (E7.2) straight
 * out of `HostSession`, nothing spell-specific to resolve beyond the spec
 * lookup itself.
 */

import { resolveAoe, type AoeHit, type AoePoint, type AoeResolveError, type AoeTarget } from "./Aoe";
import type { AbilitySpec } from "./AbilityRegistry";
import type { AoeSpec } from "./AoeRegistry";
import { err, ok, type Result } from "../Result";

type Vec3 = readonly [number, number, number];

/** Frost Puff's "short, brief" cozy cone (plan §4) — how far forward from the
 *  caster's origin the cone's blast center projects along `dir`. Deliberately
 *  short so it reads as a gentle puff, not a hitscan cone attack. */
const CONE_REACH_M = 3;

export type CastGeometryError =
  | { readonly kind: "MissingDirection" }
  | { readonly kind: "MissingGroundPoint" };

/** Whether `focus` covers `spec.resourceCost` — the host checks this before
 *  resolving anything else (security item 2d: never debit/resolve on an
 *  unaffordable cast). */
export function canAffordCast(spec: AbilitySpec, focus: number): boolean {
  return focus >= spec.resourceCost;
}

/**
 * The AoE blast center for a "cone"/"groundTarget"/"selfAoe" spec, from the
 * caster's claimed cast inputs. Never called for "projectile" targeting
 * (the caller branches before reaching here — see the module doc comment).
 */
export function resolveCastCenter(
  spec: AbilitySpec,
  origin: Vec3,
  dir: Vec3 | undefined,
  groundPoint: Vec3 | undefined,
): Result<AoePoint, CastGeometryError> {
  switch (spec.targeting) {
    case "selfAoe":
      return ok({ x: origin[0], y: origin[1], z: origin[2] });
    case "groundTarget":
      if (!groundPoint) return err({ kind: "MissingGroundPoint" });
      return ok({ x: groundPoint[0], y: groundPoint[1], z: groundPoint[2] });
    case "cone":
    case "projectile":
      if (!dir) return err({ kind: "MissingDirection" });
      return ok({
        x: origin[0] + dir[0] * CONE_REACH_M,
        y: origin[1] + dir[1] * CONE_REACH_M,
        z: origin[2] + dir[2] * CONE_REACH_M,
      });
  }
}

export interface AbilityHit {
  readonly id: string;
  /** Falloff-scaled 1..0, see `AoeHit.magnitude`. */
  readonly magnitude: number;
  /** `(spec.healing ?? spec.damage ?? 0) * magnitude` — 0 for a pure
   *  control-effect spell (Frost Puff's slow, Vine Snare's root) that
   *  neither damages nor heals; the caller still gets the resolved target
   *  set + magnitude to drive a status effect. */
  readonly amount: number;
}

/** Resolve which of `targets` an AoE-targeted spell hits, and how strongly —
 *  a thin wrapper over `resolveAoe` that also folds in the spell's own
 *  damage/healing amount (Aoe.ts's own contract: the resolver never invents
 *  an amount, the caller multiplies its own value by the returned
 *  magnitude). */
export function resolveAbilityHits(
  spec: AbilitySpec,
  aoeSpec: AoeSpec,
  center: AoePoint,
  targets: readonly AoeTarget[],
): Result<readonly AbilityHit[], AoeResolveError> {
  const resolved = resolveAoe(aoeSpec, center, targets);
  if (!resolved.ok) return err(resolved.error);
  const perUnit = spec.healing ?? spec.damage ?? 0;
  return ok(resolved.value.map((h: AoeHit) => ({ id: h.id, magnitude: h.magnitude, amount: perUnit * h.magnitude })));
}
