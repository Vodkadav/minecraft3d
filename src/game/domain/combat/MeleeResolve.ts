/**
 * Melee resolution (E7.1 — plan §4). Pure: given the attacker's equipped
 * `WeaponMetadata`, a Minecraft-1.9-style attack-strength charge fraction,
 * an aim origin/direction, and the live candidate targets, decides who gets
 * hit and for how much. The host-side adapter (`src/spawn/SpawnFieldView`)
 * is the only caller — it re-derives this itself for every attack (ADR
 * 0004: a client never claims a hit or a damage number).
 *
 * Two-dimensional (ground-plane XZ) on purpose: it replaces the pre-E7.1
 * melee reach check (`SpawnFieldView`'s flat `REACH_M`), which never
 * considered height either — creatures and the player are assumed to be at
 * roughly the same ground level for melee purposes.
 *
 * "Forward cone soft-lock assist" (kid-friendly aim-assist): a weapon with a
 * narrow-enough cone picks only the single nearest target inside its
 * reach+arc. A wide cone (>= SWEEP_CONE_DEGREES) reads as a heavy weapon's
 * sweep instead — every target inside the arc gets hit, no new
 * `WeaponMetadata` field needed for it.
 */

import { err, ok, type Result } from "../Result";
import type { WeaponMetadata } from "../items/ItemDefinition";

export type Point2 = readonly [number, number];

export interface MeleeTarget {
  readonly id: string;
  readonly position: Point2;
}

export interface MeleeHit {
  readonly targetId: string;
  readonly damage: number;
}

export type MeleeError = { readonly kind: "NoTarget" };

/** Below full charge, damage scales down to this floor fraction — spamming
 *  the attack key faster than the weapon recharges never deals zero, just
 *  less (Minecraft 1.9's attack-strength meter). */
export const MIN_CHARGE_DAMAGE_FRACTION = 0.2;

/** A weapon whose cone is this wide or wider reads as a heavy sweep: every
 *  target inside reach+arc gets hit instead of just the nearest one. */
export const SWEEP_CONE_DEGREES = 80;

/** Fallback reach/cone for a weapon that doesn't specify one — matches the
 *  pre-E7.1 bare-hands constants this module replaces (SpawnFieldView's old
 *  flat `REACH_M`; the cone is new — bare hands still only ever hit one
 *  thing, so it stays comfortably under SWEEP_CONE_DEGREES). */
export const DEFAULT_REACH_M = 3.5;
export const DEFAULT_CONE_DEGREES = 60;

/** 0..1 attack-strength charge: 0 right after a swing, ramping linearly to 1
 *  once `1/attackSpeed` seconds have passed. A non-positive `attackSpeed` is
 *  treated as "always fully charged" rather than dividing by zero. */
export function chargeFraction(secondsSinceLastAttack: number, attackSpeed: number): number {
  if (attackSpeed <= 0) return 1;
  const rechargeS = 1 / attackSpeed;
  if (secondsSinceLastAttack >= rechargeS) return 1;
  return Math.max(0, secondsSinceLastAttack / rechargeS);
}

/** Damage multiplier for a given charge fraction (0..1 in, clamped) — floors
 *  at MIN_CHARGE_DAMAGE_FRACTION rather than ever reaching zero. */
export function chargeDamageScale(charge: number): number {
  const c = Math.max(0, Math.min(1, charge));
  return MIN_CHARGE_DAMAGE_FRACTION + (1 - MIN_CHARGE_DAMAGE_FRACTION) * c;
}

export interface MeleeResolveInput {
  readonly weapon: WeaponMetadata;
  /** 0..1, see {@link chargeFraction}. */
  readonly charge: number;
  readonly origin: Point2;
  /** Aim direction — need not be normalized; the zero vector disables the
   *  facing check (every target in reach counts as "in the cone"). */
  readonly dir: Point2;
  readonly targets: readonly MeleeTarget[];
}

/** Resolves one F-press. See the module doc comment for the soft-lock vs.
 *  sweep split. Every returned hit shares the same charge-scaled damage. */
export function resolveMelee(input: MeleeResolveInput): Result<readonly MeleeHit[], MeleeError> {
  const reach = input.weapon.reach ?? DEFAULT_REACH_M;
  const coneDegrees = input.weapon.coneDegrees ?? DEFAULT_CONE_DEGREES;
  const cosHalfCone = Math.cos((coneDegrees * Math.PI) / 360);
  const [ox, oz] = input.origin;
  const [dx, dz] = input.dir;
  const dirLen = Math.hypot(dx, dz);

  const inArc: { readonly target: MeleeTarget; readonly distSq: number }[] = [];
  for (const t of input.targets) {
    const tx = t.position[0] - ox;
    const tz = t.position[1] - oz;
    const distSq = tx * tx + tz * tz;
    if (distSq > reach * reach) continue;
    if (dirLen >= 1e-9) {
      const dist = Math.sqrt(distSq);
      // dist < eps: the target is right on top of the origin — no facing to
      // check, always counts as "in the cone".
      if (dist >= 1e-9) {
        const facing = (tx * dx + tz * dz) / (dist * dirLen);
        if (facing < cosHalfCone) continue;
      }
    }
    inArc.push({ target: t, distSq });
  }
  if (inArc.length === 0) return err({ kind: "NoTarget" });

  const damage = input.weapon.damage * chargeDamageScale(input.charge);
  if (coneDegrees < SWEEP_CONE_DEGREES) {
    inArc.sort((a, b) => a.distSq - b.distSq);
    return ok([{ targetId: inArc[0]!.target.id, damage }]);
  }
  return ok(inArc.map((e) => ({ targetId: e.target.id, damage })));
}
