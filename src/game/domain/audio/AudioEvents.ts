/**
 * Pure audio *intent* registry (Workstream 1.1). Every sound the game can make
 * is a declared `AudioEventId` with metadata: which mixer bus it belongs to,
 * its base gain, whether it's 3D-positioned or a flat 2D/UI sound, and a
 * cooldown that stops rapid repeats ("machine-gunning") from the same event.
 * No Web Audio import here — this is domain, testable without a browser.
 */

export type AudioBus = "master" | "music" | "sfx" | "ambient" | "ui";

export interface AudioEventDef {
  readonly id: string;
  readonly bus: AudioBus;
  /** Base gain 0..1, before bus/master volume is applied. */
  readonly gain: number;
  /** True = positioned in 3D via the listener/panner; false = flat 2D. */
  readonly spatial: boolean;
  /** Minimum ms between two plays of this event; 0 = uncapped. */
  readonly cooldownMs: number;
  /** Higher wins when several events fire in the same tick and only one may
   *  sound (see `pickPriority`). */
  readonly priority: number;
}

export const AUDIO_EVENTS = {
  footstep: { id: "footstep", bus: "sfx", gain: 0.35, spatial: true, cooldownMs: 250, priority: 1 },
  dig: { id: "dig", bus: "sfx", gain: 0.6, spatial: true, cooldownMs: 80, priority: 2 },
  place: { id: "place", bus: "sfx", gain: 0.55, spatial: true, cooldownMs: 80, priority: 2 },
  harvest: { id: "harvest", bus: "sfx", gain: 0.6, spatial: true, cooldownMs: 120, priority: 3 },
  craft: { id: "craft", bus: "sfx", gain: 0.65, spatial: false, cooldownMs: 150, priority: 3 },
  hit: { id: "hit", bus: "sfx", gain: 0.7, spatial: true, cooldownMs: 60, priority: 5 },
  hurt: { id: "hurt", bus: "sfx", gain: 0.75, spatial: false, cooldownMs: 300, priority: 6 },
  tame: { id: "tame", bus: "sfx", gain: 0.65, spatial: true, cooldownMs: 400, priority: 4 },
  eat: { id: "eat", bus: "sfx", gain: 0.55, spatial: false, cooldownMs: 200, priority: 3 },
  sleep: { id: "sleep", bus: "sfx", gain: 0.5, spatial: false, cooldownMs: 500, priority: 3 },
  uiClick: { id: "uiClick", bus: "ui", gain: 0.5, spatial: false, cooldownMs: 40, priority: 2 },
  uiHover: { id: "uiHover", bus: "ui", gain: 0.25, spatial: false, cooldownMs: 60, priority: 1 },
  ambientWind: { id: "ambientWind", bus: "ambient", gain: 0.4, spatial: false, cooldownMs: 0, priority: 1 },
  musicCalm: { id: "musicCalm", bus: "music", gain: 0.5, spatial: false, cooldownMs: 0, priority: 1 },
} as const satisfies Record<string, AudioEventDef>;

export type AudioEventId = keyof typeof AUDIO_EVENTS;

export const AUDIO_EVENT_IDS = Object.keys(AUDIO_EVENTS) as readonly AudioEventId[];

export const AUDIO_BUSES: readonly AudioBus[] = ["master", "music", "sfx", "ambient", "ui"];

export function audioEventDef(id: AudioEventId): AudioEventDef {
  return AUDIO_EVENTS[id];
}
