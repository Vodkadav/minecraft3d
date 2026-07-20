/**
 * Pure monster-ability timing (E7.6, plan §4/§1 telegraphing research). Given
 * one creature's ability spec, its running cooldown/windup state, and the
 * live distance to its target, decides whether this tick is idle, mid-windup
 * (telegraph), or the fire moment — the fairness core every monster ability
 * (ranged spit, cozy spell, AoE stomp) shares. No THREE, no registry
 * coupling (`CreatureDefinition`/`CreatureRegistry` stay unaware of this
 * module — see its own doc comment for why), no positions beyond a scalar
 * distance: `SpawnFieldView.stepCreatures` [F] drives the actual
 * projectile/AoE resolution, VFX, and `CreatureBrain` steering hint from a
 * `"fire"`/`"windup"` tick.
 */

import type { DamageType } from "../items/ItemDefinition";

/** How the ability resolves once it fires — a straight-line simulated shot
 *  (reuses `domain/combat/Projectile.ts`, E7.2), a whimsical magical variant
 *  of the same (cozy flavor, still projectile- or aoe-resolved), or a
 *  ground-centered blast (reuses `domain/combat/Aoe.ts`, E7.4). */
export type MonsterAbilityKind = "rangedSpit" | "cozySpell" | "aoeStomp";

/** `CreatureBrain`'s direct-steering overlay for an ability-bearing creature
 *  (plan §2's constraint: no navmesh/pathfinding). "standAndCast" holds
 *  position once in range; "retreatAndFire" backs off to keep its distance
 *  when the target closes inside `minRange` (kiting). */
export type MonsterAbilityCastStyle = "standAndCast" | "retreatAndFire";

export interface CreatureAbility {
  /** Unique within the owning creature — keys the runtime cooldown state and
   *  (if it ever surfaces in UI) an i18n key. */
  readonly id: string;
  readonly kind: MonsterAbilityKind;
  readonly castStyle: MonsterAbilityCastStyle;
  /** Max engagement distance, m — the ability never triggers farther out. */
  readonly range: number;
  /** "retreatAndFire" only: the creature backs off once its target is closer
   *  than this (the kiting band); ignored for "standAndCast". */
  readonly minRange?: number;
  /** Telegraph duration before it resolves, ms — the fairness delay (plan
   *  §1: animation + SFX + a VFX marker + a windup so the player can react). */
  readonly windupMs: number;
  /** Minimum gap between casts, ms. */
  readonly cooldownMs: number;
  /** Cozy stance: kept gentle, never a punishing burst (plan §4/§6). */
  readonly damage: number;
  /** "rangedSpit"/"cozySpell" (projectile-flavored): a `ProjectileRegistry` id. */
  readonly projectileId?: string;
  /** "aoeStomp"/"cozySpell" (ground-effect-flavored): an `AoeRegistry` id. */
  readonly aoeId?: string;
  readonly damageType: DamageType;
  /** FeelEventId fired on impact — kept a plain string, matching
   *  `WeaponMetadata.feelEvent`/`AbilitySpec.feelEvent`'s decoupling from
   *  `domain/feel` (their doc comments explain why). */
  readonly feelEvent: string;
}

export interface AbilityState {
  readonly cooldownRemainingMs: number;
  /** Elapsed ms of an in-progress windup, or `null` when not casting. */
  readonly windupElapsedMs: number | null;
}

/** A creature that has never cast starts fully ready — no cold-open cooldown
 *  wait, matching every other "fresh spawn" default in this domain. */
export const IDLE_ABILITY_STATE: AbilityState = {
  cooldownRemainingMs: 0,
  windupElapsedMs: null,
};

export type AbilityTick =
  | { readonly action: "idle"; readonly state: AbilityState }
  | { readonly action: "windup"; readonly state: AbilityState; readonly progress: number }
  | { readonly action: "fire"; readonly state: AbilityState };

/**
 * Advance one ability's timing by `dtMs`. Fair-by-construction: once a
 * windup has started it always runs to completion (no last-instant cancel
 * that would read as a "gotcha" to a young player) — whether the eventual
 * resolve actually lands is up to the caller's own hit test against the
 * target's position *at the fire moment*, not this state machine. A new
 * windup only starts when off cooldown AND `distanceM` is within
 * `spec.range` this tick.
 */
export function tickAbility(
  spec: Pick<CreatureAbility, "range" | "windupMs" | "cooldownMs">,
  state: AbilityState,
  distanceM: number,
  dtMs: number,
): AbilityTick {
  const elapsedDtMs = Math.max(0, dtMs);
  const cooldownRemainingMs = Math.max(0, state.cooldownRemainingMs - elapsedDtMs);

  if (state.windupElapsedMs !== null) {
    const windupElapsedMs = state.windupElapsedMs + elapsedDtMs;
    if (windupElapsedMs >= spec.windupMs) {
      return {
        action: "fire",
        state: { cooldownRemainingMs: spec.cooldownMs, windupElapsedMs: null },
      };
    }
    return {
      action: "windup",
      state: { cooldownRemainingMs, windupElapsedMs },
      progress: spec.windupMs > 0 ? Math.min(1, windupElapsedMs / spec.windupMs) : 1,
    };
  }

  if (cooldownRemainingMs <= 0 && distanceM <= spec.range) {
    // A zero-windup ability (none shipped today, but a valid spec) has
    // nothing to telegraph — fire immediately rather than emit a
    // `"windup"` tick whose `progress` would already read 1.
    if (spec.windupMs <= 0) {
      return {
        action: "fire",
        state: { cooldownRemainingMs: spec.cooldownMs, windupElapsedMs: null },
      };
    }
    return {
      action: "windup",
      state: { cooldownRemainingMs, windupElapsedMs: 0 },
      progress: 0,
    };
  }
  return { action: "idle", state: { cooldownRemainingMs, windupElapsedMs: null } };
}
