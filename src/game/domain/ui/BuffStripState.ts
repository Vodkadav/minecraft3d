/**
 * Pure buff/effect-strip state (E8.7 HUD cohesion) — a small row of
 * active-effect chips (icon + timer). Automatic, not manually toggled: the
 * strip is visible only while chips exist and hides itself otherwise,
 * mirroring `AttackMeter.ts`/`CastBar.ts`'s "hidden when there's nothing
 * useful to show" posture rather than `PartyPanel`'s keybound show/hide.
 *
 * Standing deferral (see docs/UX_PLAN.md): Diggy World has no buff/status-
 * effect system yet — `AbilityRegistry.ts`'s Frost Puff/Vine Snare doc
 * comments explicitly note their slow/root flavor is "a status-effect system
 * not yet built". This module is the renderer-free input contract a future
 * effect system feeds; `tickBuffChips`/`buffRemainingFraction`/
 * `formatBuffTimer` are real, tested behaviour today against synthetic
 * chips, ready to drive `ui/components/BuffStrip.ts` the moment a real
 * source exists.
 */

export type BuffChipKind = "buff" | "debuff";

export interface BuffChip {
  readonly id: string;
  /** i18n key for the effect's display name, resolved by the component's
   *  Localizer — matches `ToastQueue.ts`'s `messageKey` string-key
   *  convention rather than carrying pre-localized text. */
  readonly nameKey: string;
  readonly kind: BuffChipKind;
  readonly remainingMs: number;
  readonly durationMs: number;
}

/** 0..1 remaining, clamped. A non-positive duration reads as expired (0)
 *  rather than dividing by zero. */
export function buffRemainingFraction(chip: BuffChip): number {
  if (chip.durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, chip.remainingMs / chip.durationMs));
}

/** Advances every chip's countdown by `dtMs`, dropping any that expire.
 *  Returns the same array reference when `dtMs` is non-positive (no-op). */
export function tickBuffChips(chips: readonly BuffChip[], dtMs: number): readonly BuffChip[] {
  if (dtMs <= 0) return chips;
  const next: BuffChip[] = [];
  for (const chip of chips) {
    const remainingMs = chip.remainingMs - dtMs;
    if (remainingMs <= 0) continue;
    next.push({ ...chip, remainingMs });
  }
  return next;
}

/** Compact "12s" / "1:05"-style timer text — numerals only (locale-agnostic,
 *  matches `Bar.ts`'s numeric-label convention), so no i18n catalog entry is
 *  needed for the countdown itself. */
export function formatBuffTimer(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
