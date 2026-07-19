/**
 * Validated player/world settings value. Pure domain: no I/O, no engine.
 * Persistence is a port (application/ports/SettingsStore). Every field is
 * range-checked through a factory that returns expected failures as Result
 * values (err-explicit-result-handling), so the UI can surface them.
 *
 * `boundaryRadius` seeds the world boundary (domain/boundary/Boundary),
 * `animalDensity` feeds M5 spawning, and the accessibility flags satisfy the
 * a11y baseline (scalable text, high contrast, reduced motion).
 */

import { err, ok, type Result } from "../Result";
import { DEFAULT_BOUNDARY_RADIUS } from "../boundary/Boundary";
import type { Locale } from "../i18n/translate";
import {
  DAY_LENGTH_MAX_SECONDS,
  DAY_LENGTH_MIN_SECONDS,
  DEFAULT_DAY_LENGTH_SECONDS,
} from "../time/WorldClock";
import { DIFFICULTIES, type Difficulty } from "./Difficulty";

export type GraphicsPreset = "low" | "mobile" | "high" | "ultra";

export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = [
  "low",
  "mobile",
  "high",
  "ultra",
];

export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 2.0;

// ---- E4.3: autoloot radius bounds (metres) ----
export const AUTOLOOT_RADIUS_MIN_M = 1;
export const AUTOLOOT_RADIUS_MAX_M = 15;

export interface Settings {
  readonly graphicsPreset: GraphicsPreset;
  /** Normalized 0..1; feeds M5 spawn density. */
  readonly animalDensity: number;
  /** World units (metres); must be > 0. */
  readonly boundaryRadius: number;
  readonly locale: Locale;
  readonly highContrast: boolean;
  /** Multiplier for UI text; TEXT_SCALE_MIN..TEXT_SCALE_MAX. */
  readonly textScale: number;
  readonly reducedMotion: boolean;
  /** Mixer bus volumes, each 0..1 (Workstream 1.4). */
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly ambientVolume: number;
  /** Peaceful/normal/hard multipliers on hunger/damage/death-penalty (Workstream 5.6). */
  readonly difficulty: Difficulty;
  /** Full day/night cycle length in seconds (Workstream E0.3); DAY_LENGTH_MIN..MAX_SECONDS. */
  readonly dayLengthSeconds: number;
  // ---- E4.3: autoloot ----
  readonly autolootEnabled: boolean;
  /** Metres; AUTOLOOT_RADIUS_MIN..MAX_M. */
  readonly autolootRadiusM: number;
}

/** Mutable/plain shape accepted by the factory before validation. */
export type SettingsInput = {
  readonly graphicsPreset: GraphicsPreset;
  readonly animalDensity: number;
  readonly boundaryRadius: number;
  readonly locale: Locale;
  readonly highContrast: boolean;
  readonly textScale: number;
  readonly reducedMotion: boolean;
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly ambientVolume: number;
  readonly difficulty: Difficulty;
  readonly dayLengthSeconds: number;
  readonly autolootEnabled: boolean;
  readonly autolootRadiusM: number;
};

export type SettingsError =
  | { readonly kind: "UnknownPreset"; readonly preset: string }
  | { readonly kind: "DensityOutOfRange"; readonly value: number }
  | { readonly kind: "TextScaleOutOfRange"; readonly value: number }
  | { readonly kind: "BoundaryRadiusOutOfRange"; readonly value: number }
  | { readonly kind: "VolumeOutOfRange"; readonly bus: string; readonly value: number }
  | { readonly kind: "UnknownDifficulty"; readonly value: string }
  | { readonly kind: "DayLengthOutOfRange"; readonly value: number }
  | { readonly kind: "AutolootRadiusOutOfRange"; readonly value: number };

function isGraphicsPreset(value: string): value is GraphicsPreset {
  return (GRAPHICS_PRESETS as readonly string[]).includes(value);
}

function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

export function makeSettings(input: SettingsInput): Result<Settings, SettingsError> {
  if (!isGraphicsPreset(input.graphicsPreset)) {
    return err({ kind: "UnknownPreset", preset: String(input.graphicsPreset) });
  }
  if (
    !Number.isFinite(input.animalDensity) ||
    input.animalDensity < 0 ||
    input.animalDensity > 1
  ) {
    return err({ kind: "DensityOutOfRange", value: input.animalDensity });
  }
  if (
    !Number.isFinite(input.textScale) ||
    input.textScale < TEXT_SCALE_MIN ||
    input.textScale > TEXT_SCALE_MAX
  ) {
    return err({ kind: "TextScaleOutOfRange", value: input.textScale });
  }
  if (!Number.isFinite(input.boundaryRadius) || input.boundaryRadius <= 0) {
    return err({ kind: "BoundaryRadiusOutOfRange", value: input.boundaryRadius });
  }
  const volumes: readonly [string, number][] = [
    ["master", input.masterVolume],
    ["music", input.musicVolume],
    ["sfx", input.sfxVolume],
    ["ambient", input.ambientVolume],
  ];
  for (const [bus, value] of volumes) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return err({ kind: "VolumeOutOfRange", bus, value });
    }
  }
  if (!isDifficulty(input.difficulty)) {
    return err({ kind: "UnknownDifficulty", value: String(input.difficulty) });
  }
  if (
    !Number.isFinite(input.dayLengthSeconds) ||
    input.dayLengthSeconds < DAY_LENGTH_MIN_SECONDS ||
    input.dayLengthSeconds > DAY_LENGTH_MAX_SECONDS
  ) {
    return err({ kind: "DayLengthOutOfRange", value: input.dayLengthSeconds });
  }
  if (
    !Number.isFinite(input.autolootRadiusM) ||
    input.autolootRadiusM < AUTOLOOT_RADIUS_MIN_M ||
    input.autolootRadiusM > AUTOLOOT_RADIUS_MAX_M
  ) {
    return err({ kind: "AutolootRadiusOutOfRange", value: input.autolootRadiusM });
  }
  return ok({
    graphicsPreset: input.graphicsPreset,
    animalDensity: input.animalDensity,
    boundaryRadius: input.boundaryRadius,
    locale: input.locale,
    highContrast: input.highContrast,
    textScale: input.textScale,
    reducedMotion: input.reducedMotion,
    masterVolume: input.masterVolume,
    musicVolume: input.musicVolume,
    sfxVolume: input.sfxVolume,
    ambientVolume: input.ambientVolume,
    difficulty: input.difficulty,
    dayLengthSeconds: input.dayLengthSeconds,
    autolootEnabled: input.autolootEnabled,
    autolootRadiusM: input.autolootRadiusM,
  });
}

export function defaultSettings(): Settings {
  return {
    graphicsPreset: "high",
    animalDensity: 0.5,
    boundaryRadius: DEFAULT_BOUNDARY_RADIUS,
    locale: "en",
    highContrast: false,
    textScale: 1,
    reducedMotion: false,
    masterVolume: 0.8,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    ambientVolume: 0.6,
    difficulty: "normal",
    dayLengthSeconds: DEFAULT_DAY_LENGTH_SECONDS,
    // Cozy default: autoloot ON with a comfortable walk-up radius — kids
    // shouldn't need to discover a toggle to get the "walk over it" feel.
    autolootEnabled: true,
    autolootRadiusM: 3,
  };
}

/** Pure update helper: merge a patch onto current, then re-validate the whole. */
export function updateSettings(
  current: Settings,
  patch: Partial<SettingsInput>,
): Result<Settings, SettingsError> {
  return makeSettings({ ...current, ...patch });
}
