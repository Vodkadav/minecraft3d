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

export type GraphicsPreset = "low" | "mobile" | "high" | "ultra";

export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = [
  "low",
  "mobile",
  "high",
  "ultra",
];

export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 2.0;

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
};

export type SettingsError =
  | { readonly kind: "UnknownPreset"; readonly preset: string }
  | { readonly kind: "DensityOutOfRange"; readonly value: number }
  | { readonly kind: "TextScaleOutOfRange"; readonly value: number }
  | { readonly kind: "BoundaryRadiusOutOfRange"; readonly value: number };

function isGraphicsPreset(value: string): value is GraphicsPreset {
  return (GRAPHICS_PRESETS as readonly string[]).includes(value);
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
  return ok({
    graphicsPreset: input.graphicsPreset,
    animalDensity: input.animalDensity,
    boundaryRadius: input.boundaryRadius,
    locale: input.locale,
    highContrast: input.highContrast,
    textScale: input.textScale,
    reducedMotion: input.reducedMotion,
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
  };
}

/** Pure update helper: merge a patch onto current, then re-validate the whole. */
export function updateSettings(
  current: Settings,
  patch: Partial<SettingsInput>,
): Result<Settings, SettingsError> {
  return makeSettings({ ...current, ...patch });
}
