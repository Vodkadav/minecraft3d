/**
 * Progression event vocabulary (Workstream 6). Every game action that feeds
 * objectives/achievements/the tier curve is one of these ids — mirrors how
 * `domain/audio/AudioEvents` enumerates audio events. Call sites fire these
 * through an optional `onProgress` callback, the same threading pattern
 * already used for `AudioPort`/`FeelPort` at the dig/harvest/craft sites.
 */

export const PROGRESSION_EVENT_IDS = [
  "dig",
  "craft",
  "place",
  "tame",
  "kill",
  "eat",
  "sleep",
  "harvest",
] as const;

export type ProgressionEventId = (typeof PROGRESSION_EVENT_IDS)[number];
