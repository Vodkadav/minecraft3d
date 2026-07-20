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
  | "starve"
  | "heal"
  | "levelUp"
  // E7.0 combat contracts — declared+typed here so the 8 combat streams can
  // trigger them from commit one; no FeelDirector visual owns these yet
  // (each stream ships its own [F] slice, plan §5). Firing an id with no
  // visual mapped is a safe no-op today, same as any other declared event.
  | "meleeSwing"
  | "arrowHit"
  | "spellSpark"
  | "spellFrost"
  | "spellNature"
  | "boom"
  | "trapArm"
  | "trapTrigger"
  | "monsterCast"
  | "monsterTelegraph"
  | "defeatPoof"
  | "playerDown";

/** Which floating-number theme (E2.4) a triggered event spawns, or `null` for
 *  none — a sibling kind to the pre-existing damage-only number so the same
 *  pooled renderer can theme heal (green) and XP (gold) numbers distinctly
 *  from damage (red/amber-on-crit) without a second number system. */
export type FeelNumberKind = "damage" | "heal" | "xp";

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
  /** Spawns a themed floating number at the event's world position (value
   *  from the caller), or `null` for no number. */
  readonly numberKind: FeelNumberKind | null;
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
    numberKind: "damage",
    particleBurst: "hit",
    rumble: { intensity: 0.35, durationMs: 80 },
  },
  kill: {
    shakeTrauma: 0.35,
    hitStopMs: 90,
    vignette: null,
    numberKind: "damage",
    particleBurst: "hit",
    rumble: { intensity: 0.6, durationMs: 140 },
  },
  takeDamage: {
    shakeTrauma: 0.3,
    hitStopMs: 60,
    vignette: { kind: "hurt", intensity: 0.6 },
    numberKind: null,
    particleBurst: null,
    rumble: { intensity: 0.7, durationMs: 160 },
  },
  harvest: {
    shakeTrauma: 0.05,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "harvest",
    rumble: { intensity: 0.15, durationMs: 40 },
  },
  dig: {
    shakeTrauma: 0.06,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "dig",
    rumble: { intensity: 0.2, durationMs: 40 },
  },
  place: {
    shakeTrauma: 0.04,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "place",
    rumble: { intensity: 0.15, durationMs: 30 },
  },
  tame: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: { kind: "heal", intensity: 0.4 },
    numberKind: null,
    particleBurst: "tame",
    rumble: { intensity: 0.25, durationMs: 60 },
  },
  eat: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: { kind: "heal", intensity: 0.25 },
    numberKind: null,
    particleBurst: null,
    rumble: null,
  },
  starve: {
    shakeTrauma: 0.05,
    hitStopMs: 0,
    vignette: { kind: "hurt", intensity: 0.35 },
    numberKind: null,
    particleBurst: null,
    rumble: { intensity: 0.15, durationMs: 60 },
  },
  // E2.4: heal/XP floating numbers reuse the same trigger/pooled-renderer
  // seam as damage — no vignette/shake here since "eat"/regen already own
  // the screen-level heal feedback; this event exists purely to carry a
  // themed floating number at a caller-supplied world position + value.
  heal: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: null,
    numberKind: "heal",
    particleBurst: null,
    rumble: null,
  },
  levelUp: {
    shakeTrauma: 0.1,
    hitStopMs: 0,
    vignette: null,
    numberKind: "xp",
    particleBurst: null,
    rumble: { intensity: 0.3, durationMs: 100 },
  },
  // ---- E7.0 combat contracts: bundles, no visual yet (plan §5) ----
  meleeSwing: {
    shakeTrauma: 0.05,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "meleeSwing",
    rumble: { intensity: 0.15, durationMs: 30 },
  },
  arrowHit: {
    shakeTrauma: 0.15,
    hitStopMs: 30,
    vignette: null,
    numberKind: "damage",
    particleBurst: "arrowHit",
    rumble: { intensity: 0.3, durationMs: 70 },
  },
  spellSpark: {
    shakeTrauma: 0.1,
    hitStopMs: 20,
    vignette: null,
    numberKind: "damage",
    particleBurst: "spellSpark",
    rumble: { intensity: 0.25, durationMs: 60 },
  },
  spellFrost: {
    shakeTrauma: 0.08,
    hitStopMs: 15,
    vignette: null,
    numberKind: "damage",
    particleBurst: "spellFrost",
    rumble: { intensity: 0.2, durationMs: 50 },
  },
  spellNature: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "spellNature",
    rumble: { intensity: 0.15, durationMs: 40 },
  },
  boom: {
    shakeTrauma: 0.4,
    hitStopMs: 80,
    vignette: null,
    numberKind: "damage",
    particleBurst: "boom",
    rumble: { intensity: 0.7, durationMs: 150 },
  },
  trapArm: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "trapArm",
    rumble: null,
  },
  trapTrigger: {
    shakeTrauma: 0.25,
    hitStopMs: 40,
    vignette: null,
    numberKind: "damage",
    particleBurst: "trapTrigger",
    rumble: { intensity: 0.4, durationMs: 90 },
  },
  monsterCast: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "monsterCast",
    rumble: null,
  },
  monsterTelegraph: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "monsterTelegraph",
    rumble: null,
  },
  defeatPoof: {
    shakeTrauma: 0.1,
    hitStopMs: 0,
    vignette: null,
    numberKind: null,
    particleBurst: "defeatPoof",
    rumble: { intensity: 0.2, durationMs: 60 },
  },
  // Gentle: screen desaturate/fall are presentation-only additions a later
  // stream owns (plan §4 E7.7) — this bundle only carries the shared-juice
  // slice (hurt vignette + rumble), no shake so it never reads as violent.
  playerDown: {
    shakeTrauma: 0,
    hitStopMs: 0,
    vignette: { kind: "hurt", intensity: 0.7 },
    numberKind: null,
    particleBurst: null,
    rumble: { intensity: 0.5, durationMs: 200 },
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
