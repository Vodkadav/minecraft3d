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
import { NAMEPLATE_MODES, type NameplateMode } from "../hud/Nameplate";
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

/** E2.1: the vitals HUD style — classic bars, or Diablo-style corner orbs
 *  with a level portrait. Defaults to "bars" so a no-flags boot stays
 *  pixel-identical (the ARPG-cozy invariant). */
export type HudStyle = "bars" | "orbs";

export const HUD_STYLES: readonly HudStyle[] = ["bars", "orbs"];

/** E8.6: tooltip item-card detail level — full stat/affix rows, or a compact
 *  one-liner. Defaults to "full" so a no-flags boot stays pixel-identical. */
export type TooltipVerbosity = "full" | "compact";

export const TOOLTIP_VERBOSITIES: readonly TooltipVerbosity[] = ["full", "compact"];

export const TEXT_SCALE_MIN = 0.8;
export const TEXT_SCALE_MAX = 2.0;

// ---- E4.3: autoloot radius bounds (metres) ----
export const AUTOLOOT_RADIUS_MIN_M = 1;
export const AUTOLOOT_RADIUS_MAX_M = 15;

// ---- E6.6: spawn-rate multiplier bounds (stack onto animalDensity) ----
export const SPAWN_RATE_MIN = 0.25;
export const SPAWN_RATE_MAX = 3;

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
  /** Global nameplate show/hide policy (E2.2); per-faction toggles below narrow it further. */
  readonly nameplateMode: NameplateMode;
  readonly nameplateFriendly: boolean;
  readonly nameplateNeutral: boolean;
  readonly nameplateHostile: boolean;
  readonly nameplateTamed: boolean;
  readonly nameplatePlayers: boolean;
  /** Vitals HUD presentation (E2.1); defaults to "bars". */
  readonly hudStyle: HudStyle;
  // ---- E4.3: autoloot ----
  readonly autolootEnabled: boolean;
  /** Metres; AUTOLOOT_RADIUS_MIN..MAX_M. */
  readonly autolootRadiusM: number;
  // ---- E6.6: spawn-rate multipliers, stacked onto animalDensity/SpawnField
  // density (domain/spawn/SpawnField's biome/time gate) ----
  /** SPAWN_RATE_MIN..MAX; default 1 (no-op). */
  readonly creatureSpawnRate: number;
  /** SPAWN_RATE_MIN..MAX; default 1 (no-op). */
  readonly resourceSpawnRate: number;
  // ---- E8.8: colorblind-safe rarity palette (default off, no-op) ----
  readonly colorblindRarity: boolean;
  // ---- E8.6: tooltip item-card detail level (default "full", no-op) ----
  readonly tooltipVerbosity: TooltipVerbosity;
  // ---- E8.6: dial back non-essential decorative glow/animation (default off, no-op) ----
  readonly reduceFlair: boolean;
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
  readonly nameplateMode: NameplateMode;
  readonly nameplateFriendly: boolean;
  readonly nameplateNeutral: boolean;
  readonly nameplateHostile: boolean;
  readonly nameplateTamed: boolean;
  readonly nameplatePlayers: boolean;
  readonly hudStyle: HudStyle;
  readonly autolootEnabled: boolean;
  readonly autolootRadiusM: number;
  readonly creatureSpawnRate: number;
  readonly resourceSpawnRate: number;
  readonly colorblindRarity: boolean;
  readonly tooltipVerbosity: TooltipVerbosity;
  readonly reduceFlair: boolean;
};

export type SettingsError =
  | { readonly kind: "UnknownPreset"; readonly preset: string }
  | { readonly kind: "DensityOutOfRange"; readonly value: number }
  | { readonly kind: "TextScaleOutOfRange"; readonly value: number }
  | { readonly kind: "BoundaryRadiusOutOfRange"; readonly value: number }
  | { readonly kind: "VolumeOutOfRange"; readonly bus: string; readonly value: number }
  | { readonly kind: "UnknownDifficulty"; readonly value: string }
  | { readonly kind: "DayLengthOutOfRange"; readonly value: number }
  | { readonly kind: "UnknownNameplateMode"; readonly value: string }
  | { readonly kind: "UnknownHudStyle"; readonly value: string }
  | { readonly kind: "AutolootRadiusOutOfRange"; readonly value: number }
  | { readonly kind: "CreatureSpawnRateOutOfRange"; readonly value: number }
  | { readonly kind: "ResourceSpawnRateOutOfRange"; readonly value: number }
  | { readonly kind: "UnknownTooltipVerbosity"; readonly value: string };

function isGraphicsPreset(value: string): value is GraphicsPreset {
  return (GRAPHICS_PRESETS as readonly string[]).includes(value);
}

function isDifficulty(value: string): value is Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

function isNameplateMode(value: string): value is NameplateMode {
  return (NAMEPLATE_MODES as readonly string[]).includes(value);
}

function isHudStyle(value: string): value is HudStyle {
  return (HUD_STYLES as readonly string[]).includes(value);
}

function isTooltipVerbosity(value: string): value is TooltipVerbosity {
  return (TOOLTIP_VERBOSITIES as readonly string[]).includes(value);
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
  if (!isNameplateMode(input.nameplateMode)) {
    return err({ kind: "UnknownNameplateMode", value: String(input.nameplateMode) });
  }
  if (!isHudStyle(input.hudStyle)) {
    return err({ kind: "UnknownHudStyle", value: String(input.hudStyle) });
  }
  if (
    !Number.isFinite(input.autolootRadiusM) ||
    input.autolootRadiusM < AUTOLOOT_RADIUS_MIN_M ||
    input.autolootRadiusM > AUTOLOOT_RADIUS_MAX_M
  ) {
    return err({ kind: "AutolootRadiusOutOfRange", value: input.autolootRadiusM });
  }
  if (
    !Number.isFinite(input.creatureSpawnRate) ||
    input.creatureSpawnRate < SPAWN_RATE_MIN ||
    input.creatureSpawnRate > SPAWN_RATE_MAX
  ) {
    return err({ kind: "CreatureSpawnRateOutOfRange", value: input.creatureSpawnRate });
  }
  if (
    !Number.isFinite(input.resourceSpawnRate) ||
    input.resourceSpawnRate < SPAWN_RATE_MIN ||
    input.resourceSpawnRate > SPAWN_RATE_MAX
  ) {
    return err({ kind: "ResourceSpawnRateOutOfRange", value: input.resourceSpawnRate });
  }
  if (!isTooltipVerbosity(input.tooltipVerbosity)) {
    return err({
      kind: "UnknownTooltipVerbosity",
      value: String(input.tooltipVerbosity),
    });
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
    nameplateMode: input.nameplateMode,
    nameplateFriendly: input.nameplateFriendly,
    nameplateNeutral: input.nameplateNeutral,
    nameplateHostile: input.nameplateHostile,
    nameplateTamed: input.nameplateTamed,
    nameplatePlayers: input.nameplatePlayers,
    hudStyle: input.hudStyle,
    autolootEnabled: input.autolootEnabled,
    autolootRadiusM: input.autolootRadiusM,
    creatureSpawnRate: input.creatureSpawnRate,
    resourceSpawnRate: input.resourceSpawnRate,
    colorblindRarity: input.colorblindRarity,
    tooltipVerbosity: input.tooltipVerbosity,
    reduceFlair: input.reduceFlair,
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
    // Cozy default: nameplates always on, every faction visible — the
    // overlay itself only ever mounts once a world with creatures is
    // running (src/spawn/NameplateView.ts), so this default costs nothing
    // on menus/boot.
    nameplateMode: "always",
    nameplateFriendly: true,
    nameplateNeutral: true,
    nameplateHostile: true,
    nameplateTamed: true,
    nameplatePlayers: true,
    // Owner playtest 2026-07-21: bars sat behind the central hotbar/action-bar
    // column. Orbs anchor health/energy to the screen corners, clear of it.
    hudStyle: "orbs",
    // Cozy default: autoloot ON with a comfortable walk-up radius — kids
    // shouldn't need to discover a toggle to get the "walk over it" feel.
    autolootEnabled: true,
    autolootRadiusM: 3,
    // E6.6: 1 = no-op, identical to pre-E6.6 SpawnField density behaviour.
    creatureSpawnRate: 1,
    resourceSpawnRate: 1,
    colorblindRarity: false,
    tooltipVerbosity: "full",
    reduceFlair: false,
  };
}

/** Pure update helper: merge a patch onto current, then re-validate the whole. */
export function updateSettings(
  current: Settings,
  patch: Partial<SettingsInput>,
): Result<Settings, SettingsError> {
  return makeSettings({ ...current, ...patch });
}
