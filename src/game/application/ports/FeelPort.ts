/**
 * Feel port for Workstream 2 (mirrors AudioPort — same call sites, same
 * shape). The application/UI layers only ever see this interface; the DOM/
 * THREE/Gamepad presentation lives behind `src/feel/FeelDirector.ts`, and
 * tests can use a trivial in-memory fake that just records calls.
 */

import type { FeelEventId } from "../../domain/feel/FeelEvents";

export interface FeelTriggerOptions {
  /** World-space position — drives damage-number placement and particle bursts. */
  readonly worldPos?: readonly [number, number, number];
  /** Whether this hit was a critical — scales shake/hit-stop/rumble and the number's size. */
  readonly crit?: boolean;
  /** The numeric value to show for a floating-number event (damage/heal/xp —
   *  themed per the event's `FeedbackBundle.numberKind`, E2.4). */
  readonly numberValue?: number;
}

export interface FeelPort {
  /** Fire one gameplay event; fans out to shake/hit-stop/vignette/damage-number/particles/rumble. */
  trigger(event: FeelEventId, opts?: FeelTriggerOptions): void;
  /** Scale a raw frame dt down while hit-stop is active — PRESENTATION only
   *  (animation mixers, camera FOV punch). Never feed this into simulation/
   *  netcode timers; callers that own both use the real `dt` for those and
   *  this scaled value only for the visual/animation step. Optional: a fake
   *  in tests can omit it and callers fall back to the real dt. */
  presentationDt?(dt: number): number;
}
