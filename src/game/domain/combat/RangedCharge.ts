/**
 * Draw-to-charge → damage-multiplier curve (E7.2 ranged + ammo, plan §4).
 * Pure and host-resolved: the client's `aimedAttack.chargeMs` is only an
 * INPUT (how long the draw was held, like `dir` is an input aim vector) —
 * the host clamps it to the same bound `Protocol.parseMessage` enforces and
 * runs it through this curve itself, never trusting a claimed multiplier or
 * damage number (ADR 0004 §2/security item 5).
 */

/** ≥1s held = "strong" (plan §4) — full multiplier. */
export const FULL_CHARGE_MS = 1000;

/** A tap-fire (no hold) still lands a real, if weak, hit — never a zero. */
export const MIN_CHARGE_MULTIPLIER = 0.35;

/** Damage multiplier for a charge held `chargeMs` — clamped to
 *  [0, FULL_CHARGE_MS], linear ramp from `MIN_CHARGE_MULTIPLIER` to 1.0. */
export function chargeMultiplier(chargeMs: number): number {
  const clamped = Math.max(0, Math.min(FULL_CHARGE_MS, chargeMs));
  const t = clamped / FULL_CHARGE_MS;
  return MIN_CHARGE_MULTIPLIER + (1 - MIN_CHARGE_MULTIPLIER) * t;
}

/** Whether a held duration counts as a "strong" shot (plan §4 — cosmetic/UX
 *  threshold, e.g. a stronger draw-release VFX; damage itself is already a
 *  smooth ramp via `chargeMultiplier`, not a hard step). */
export function isStrongCharge(chargeMs: number): boolean {
  return chargeMs >= FULL_CHARGE_MS;
}
