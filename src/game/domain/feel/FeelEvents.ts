/**
 * Pure "juice" feedback registry (Workstream 2.1) — mirrors domain/audio's
 * AudioEvents shape. Every gameplay moment that should feel punchy declares a
 * `FeelEventId` with a declarative feedback bundle: shake trauma, hit-stop
 * ms, an optional vignette pulse, whether it spawns a floating damage
 * number, an optional impact-particle burst id, and an optional gamepad
 * rumble. No DOM/THREE/Gamepad API here — those live in the presentation
 * adapters (src/feel/*) that read this registry.
 */

export type FeelEventId =
  | "attackHit"
  | "kill"
  | "takeDamage"
  | "harvest"
  | "dig"
  | "place"
  | "tame"
  | "eat"
  | "starve";

export interface VignetteSpec {
  readonly kind: "hurt" | "heal";
  /** Peak intensity 0..1 at the moment the pulse fires. */
  readonly intensity: number;
}

export interface RumbleSpec {
  /** 0..1 motor strength. */
  readonly intensity: number;
  readonly durationMs: number;
}

export interface FeedbackBundle {
  /** Trauma added to the shake pool (0..1); pool clamps at 1, decays over time. */
  readonly shakeTrauma: number;
  /** Presentation-only time dip on impact, ms; caps rather than stacks. */
  readonly hitStopMs: number;
  readonly vignette: VignetteSpec | null;
  /** Spawns a floating number at the event's world position (value from combat). */
  readonly damageNumber: boolean;
  /** Impact-particle burst id, or null for no burst. */
  readonly particleBurst: string | null;
  readonly rumble: RumbleSpec | null;
}

/** Crit multiplier applied to shake/hit-stop/rumble on a critical hit. */
export const CRIT_MULTIPLIER = 1.6;

export const FEEL_EVENTS = {
  attackHit: {
    shakeTrauma: 0.18,
    hitStopMs: 40,
    vignette: null,
    damageNumber: true,
    particleBurst: "hit",
    rumble: { intensity: 0.35, durationMs: 80 },
  },
  kill: {
    shakeTrauma: 0.35,
    hitStopMs: 90,
    vignette: null,
    damageNumber: true,
    particleBurst: "hit",
    rumble: { intensity: 0.6, durationMs: 140 },
  },
  takeDamage: {
    shakeTrauma: 0.3,
    hitStopMs: 60,
    vignette: { kind: "hurt", intensity: 0.6 },
    damageNumber: false,
    particleBurst: null,
    rumble: { intensity: 0.7, durationMs: 160 },
  },
  harvest: {
    shakeTrauma: 0.05,
    hitStopMs: 0,
    vignette: null,
    damageNumber: false,
    particleBurst: "harvest",
    rumble: { intensity: 0.15, durationMs: 40 },
  },
  dig: {
    shakeTrauma: 0.06,
    hitStopMs: 0,
    vignette: null,
    damageNumber: false,
    particleBurst: "dig",
    rumble: { intensity: 0.2, durationMs: 40 },
  },
  place: {
    shakeTrauma: 0.04,
    hitStopMs: 0,
    vignette: null,
    damageNumber: false,
    particleBurst: "place",
    rumble: { intensity: 0.15, durationMs: 30 },
  },
  tame: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: { kind: "heal", intensity: 0.4 },
    damageNumber: false,
    particleBurst: "tame",
    rumble: { intensity: 0.25, durationMs: 60 },
  },
  eat: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: { kind: "heal", intensity: 0.25 },
    damageNumber: false,
    particleBurst: null,
    rumble: null,
  },
  starve: {
    shakeTrauma: 0.05,
    hitStopMs: 0,
    vignette: { kind: "hurt", intensity: 0.35 },
    damageNumber: false,
    particleBurst: null,
    rumble: { intensity: 0.15, durationMs: 60 },
  },
} as const satisfies Record<FeelEventId, FeedbackBundle>;

export const FEEL_EVENT_IDS = Object.keys(FEEL_EVENTS) as readonly FeelEventId[];

/** Resolve an event's bundle, scaling shake/hit-stop/rumble up on a crit. */
export function resolveFeedback(id: FeelEventId, opts?: { crit?: boolean }): FeedbackBundle {
  const base = FEEL_EVENTS[id];
  if (!opts?.crit) return base;
  return {
    ...base,
    shakeTrauma: Math.min(1, base.shakeTrauma * CRIT_MULTIPLIER),
    hitStopMs: base.hitStopMs * CRIT_MULTIPLIER,
    rumble: base.rumble
      ? {
          intensity: Math.min(1, base.rumble.intensity * CRIT_MULTIPLIER),
          durationMs: base.rumble.durationMs * CRIT_MULTIPLIER,
        }
      : null,
  };
}
