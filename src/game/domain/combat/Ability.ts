/**
 * Spellcast resolution (E7.3 — plan §4). Pure: given a cast's targeting mode
 * (from its `AbilitySpec`) and the caster's aimed origin/dir/groundPoint,
 * resolves where an AoE-shaped spell's blast is centered, then scales
 * `Aoe.ts`'s `resolveAoe` hits by the spell's OWN damage/healing amount —
 * mirrors `Aoe.ts`'s own contract ("the resolver never invents an amount
 * itself"), so a spell's power always traces back to `AbilityRegistry`,
 * never a claimed wire value (ADR 0004 §2). `HostSession` is the only real
 * caller; this module stays Three.js-free like every other domain module.
 *
 * "projectile"-targeting spells (Sparkle Bolt) don't resolve here at all —
 * they reuse `Projectile.ts`'s host-simulated flight sim directly (the same
 * pooled shot a ranged weapon's arrow uses), so this module only covers the
 * three AoE-shaped targeting modes (cone/groundTarget/selfAoe).
 */

import type { AbilitySpec, AbilityTargeting } from "./AbilityRegistry";
import type { AoeSpec } from "./AoeRegistry";
import type { AoeHit } from "./Aoe";
import { err, ok, type Result } from "../Result";

export type Vec3 = readonly [number, number, number];

export type AbilityAoeError =
  | { readonly kind: "NoAim" }
  | { readonly kind: "NotAoeTargeting" };

export interface AbilityCastAim {
  readonly targeting: AbilityTargeting;
  readonly origin: Vec3;
  readonly dir?: Vec3;
  readonly groundPoint?: Vec3;
}

/**
 * Where a cone/groundTarget/selfAoe spell's blast is centered:
 * - `selfAoe` (Healing Bloom) centers on the caster.
 * - `groundTarget` (Vine Snare) centers on the claimed ground point.
 * - `cone` (Frost Puff) reads as a short puff a little ahead of the caster —
 *   half the AoE's own radius forward along `dir`, a deliberate
 *   simplification over true angular-cone math (cozy/kid-friendly: a
 *   "gentle" effect that only ever reaches a few meters doesn't need a
 *   directional arc test on top of the radius one `resolveAoe` already
 *   does).
 * - `projectile` (Sparkle Bolt) never resolves an AoE center — it's an
 *   error to call this for one (see the module doc comment).
 */
export function resolveAoeCenter(aim: AbilityCastAim, aoeSpec: AoeSpec): Result<Vec3, AbilityAoeError> {
  switch (aim.targeting) {
    case "selfAoe":
      return ok(aim.origin);
    case "groundTarget":
      if (!aim.groundPoint) return err({ kind: "NoAim" });
      return ok(aim.groundPoint);
    case "cone": {
      if (!aim.dir) return err({ kind: "NoAim" });
      const offset = aoeSpec.radius * 0.5;
      return ok([
        aim.origin[0] + aim.dir[0] * offset,
        aim.origin[1] + aim.dir[1] * offset,
        aim.origin[2] + aim.dir[2] * offset,
      ]);
    }
    case "projectile":
      return err({ kind: "NotAoeTargeting" });
  }
}

export interface AbilityHit {
  readonly id: string;
  readonly damage: number;
  readonly healing: number;
}

/** Scale each `AoeHit`'s falloff magnitude by the spec's own damage/healing
 *  amount — the resolver never invents an amount itself. Missing damage/
 *  healing on the spec reads as 0, not an error (a pure-heal spell has no
 *  `damage`, a pure-damage spell has no `healing`). */
export function scaleAbilityHits(spec: AbilitySpec, hits: readonly AoeHit[]): readonly AbilityHit[] {
  return hits.map((h) => ({
    id: h.id,
    damage: (spec.damage ?? 0) * h.magnitude,
    healing: (spec.healing ?? 0) * h.magnitude,
  }));
}
