import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { DEFAULT_BOUNDARY_RADIUS } from "../boundary/Boundary";
import { DEFAULT_DAY_LENGTH_SECONDS } from "../time/WorldClock";
import {
  defaultSettings,
  makeSettings,
  updateSettings,
  type SettingsInput,
} from "./Settings";

function validInput(overrides: Partial<SettingsInput> = {}): SettingsInput {
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
    nameplateMode: "always",
    nameplateFriendly: true,
    nameplateNeutral: true,
    nameplateHostile: true,
    nameplateTamed: true,
    nameplatePlayers: true,
    hudStyle: "bars",
    autolootEnabled: true,
    autolootRadiusM: 3,
    creatureSpawnRate: 1,
    resourceSpawnRate: 1,
    colorblindRarity: false,
    tooltipVerbosity: "full",
    reduceFlair: false,
    ...overrides,
  };
}

describe("Settings", () => {
  it("builds a valid settings value", () => {
    const r = makeSettings(validInput());
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.graphicsPreset).toBe("high");
  });

  it("accepts the mobile graphics preset", () => {
    const r = makeSettings(validInput({ graphicsPreset: "mobile" }));
    expect(isOk(r)).toBe(true);
  });

  it("rejects an unknown graphics preset", () => {
    const r = makeSettings(validInput({ graphicsPreset: "potato" as never }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownPreset");
  });

  it("rejects animal density below 0", () => {
    const r = makeSettings(validInput({ animalDensity: -0.1 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DensityOutOfRange");
  });

  it("rejects animal density above 1", () => {
    const r = makeSettings(validInput({ animalDensity: 1.5 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DensityOutOfRange");
  });

  it("rejects a non-finite animal density", () => {
    const r = makeSettings(validInput({ animalDensity: Number.NaN }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DensityOutOfRange");
  });

  it("rejects a text scale below the minimum", () => {
    const r = makeSettings(validInput({ textScale: 0.5 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("TextScaleOutOfRange");
  });

  it("rejects a text scale above the maximum", () => {
    const r = makeSettings(validInput({ textScale: 3 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("TextScaleOutOfRange");
  });

  it("rejects a non-positive boundary radius", () => {
    const r = makeSettings(validInput({ boundaryRadius: 0 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("BoundaryRadiusOutOfRange");
  });

  it("defaults to a valid, sensible settings value", () => {
    const s = defaultSettings();
    expect(s.boundaryRadius).toBe(DEFAULT_BOUNDARY_RADIUS);
    expect(s.locale).toBe("en");
    expect(isOk(makeSettings(s))).toBe(true);
  });

  it("updates a single field while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { highContrast: true, textScale: 1.4 });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.highContrast).toBe(true);
      expect(r.value.textScale).toBe(1.4);
      expect(r.value.graphicsPreset).toBe(defaultSettings().graphicsPreset);
    }
  });

  it("rejects an update that violates a constraint", () => {
    const r = updateSettings(defaultSettings(), { animalDensity: 2 });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DensityOutOfRange");
  });

  it("rejects a bus volume below 0", () => {
    const r = makeSettings(validInput({ musicVolume: -0.1 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe("VolumeOutOfRange");
      if (r.error.kind === "VolumeOutOfRange") expect(r.error.bus).toBe("music");
    }
  });

  it("rejects a bus volume above 1", () => {
    const r = makeSettings(validInput({ sfxVolume: 1.5 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("VolumeOutOfRange");
  });

  it("accepts every declared difficulty", () => {
    for (const difficulty of ["peaceful", "normal", "hard"] as const) {
      expect(isOk(makeSettings(validInput({ difficulty })))).toBe(true);
    }
  });

  it("rejects an unknown difficulty", () => {
    const r = makeSettings(validInput({ difficulty: "nightmare" as never }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownDifficulty");
  });

  it("defaults to normal difficulty", () => {
    expect(defaultSettings().difficulty).toBe("normal");
  });

  it("defaults dayLengthSeconds to the engine's existing (static) cycle speed", () => {
    expect(defaultSettings().dayLengthSeconds).toBe(DEFAULT_DAY_LENGTH_SECONDS);
  });

  it("rejects a day length below the minimum", () => {
    const r = makeSettings(validInput({ dayLengthSeconds: 1 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DayLengthOutOfRange");
  });

  it("rejects a day length above the maximum", () => {
    const r = makeSettings(validInput({ dayLengthSeconds: 100000 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DayLengthOutOfRange");
  });

  it("rejects a non-finite day length", () => {
    const r = makeSettings(validInput({ dayLengthSeconds: Number.NaN }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DayLengthOutOfRange");
  });

  it("updates the day length while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { dayLengthSeconds: 600 });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.dayLengthSeconds).toBe(600);
  });

  it("defaults nameplates to always-on, every faction visible (cozy default)", () => {
    const s = defaultSettings();
    expect(s.nameplateMode).toBe("always");
    expect(s.nameplateFriendly).toBe(true);
    expect(s.nameplateNeutral).toBe(true);
    expect(s.nameplateHostile).toBe(true);
    expect(s.nameplateTamed).toBe(true);
    expect(s.nameplatePlayers).toBe(true);
  });

  it("accepts every declared nameplate mode", () => {
    for (const nameplateMode of ["always", "onHover", "inCombat", "off"] as const) {
      expect(isOk(makeSettings(validInput({ nameplateMode })))).toBe(true);
    }
  });

  it("rejects an unknown nameplate mode", () => {
    const r = makeSettings(validInput({ nameplateMode: "screaming" as never }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownNameplateMode");
  });

  it("updates a single nameplate faction toggle while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { nameplateHostile: false });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.nameplateHostile).toBe(false);
      expect(r.value.nameplateFriendly).toBe(true);
      expect(r.value.nameplateMode).toBe("always");
    }
  });

  // E2.1
  it("accepts every declared hud style", () => {
    for (const hudStyle of ["bars", "orbs"] as const) {
      expect(isOk(makeSettings(validInput({ hudStyle })))).toBe(true);
    }
  });

  it("rejects an unknown hud style", () => {
    const r = makeSettings(validInput({ hudStyle: "wheel" as never }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownHudStyle");
  });

  it("defaults to the bars hud style (no-flags boot stays pixel-identical)", () => {
    expect(defaultSettings().hudStyle).toBe("bars");
  });

  it("updates hudStyle while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { hudStyle: "orbs" });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.hudStyle).toBe("orbs");
  });

  it("defaults autoloot on with a 3m radius (E4.3: cozy walk-up-and-collect)", () => {
    expect(defaultSettings().autolootEnabled).toBe(true);
    expect(defaultSettings().autolootRadiusM).toBe(3);
  });

  it("rejects an autoloot radius below the minimum", () => {
    const r = makeSettings(validInput({ autolootRadiusM: 0 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("AutolootRadiusOutOfRange");
  });

  it("rejects an autoloot radius above the maximum", () => {
    const r = makeSettings(validInput({ autolootRadiusM: 100 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("AutolootRadiusOutOfRange");
  });

  it("rejects a non-finite autoloot radius", () => {
    const r = makeSettings(validInput({ autolootRadiusM: Number.NaN }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("AutolootRadiusOutOfRange");
  });

  it("updates autolootEnabled/autolootRadiusM while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { autolootEnabled: false, autolootRadiusM: 8 });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.autolootEnabled).toBe(false);
      expect(r.value.autolootRadiusM).toBe(8);
    }
  });

  it("defaults both spawn-rate multipliers to 1 (E6.6: no-op)", () => {
    expect(defaultSettings().creatureSpawnRate).toBe(1);
    expect(defaultSettings().resourceSpawnRate).toBe(1);
  });

  it("rejects a creature spawn rate below the minimum", () => {
    const r = makeSettings(validInput({ creatureSpawnRate: 0.1 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("CreatureSpawnRateOutOfRange");
  });

  it("rejects a creature spawn rate above the maximum", () => {
    const r = makeSettings(validInput({ creatureSpawnRate: 5 }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("CreatureSpawnRateOutOfRange");
  });

  it("rejects a non-finite creature spawn rate", () => {
    const r = makeSettings(validInput({ creatureSpawnRate: Number.NaN }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("CreatureSpawnRateOutOfRange");
  });

  it("rejects a resource spawn rate outside 0.25..3", () => {
    const low = makeSettings(validInput({ resourceSpawnRate: 0.24 }));
    const high = makeSettings(validInput({ resourceSpawnRate: 3.01 }));
    expect(isErr(low)).toBe(true);
    expect(isErr(high)).toBe(true);
    if (isErr(low)) expect(low.error.kind).toBe("ResourceSpawnRateOutOfRange");
    if (isErr(high)) expect(high.error.kind).toBe("ResourceSpawnRateOutOfRange");
  });

  it("accepts the boundary spawn-rate values", () => {
    const r = makeSettings(validInput({ creatureSpawnRate: 0.25, resourceSpawnRate: 3 }));
    expect(isOk(r)).toBe(true);
  });

  it("updates creatureSpawnRate/resourceSpawnRate while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), {
      creatureSpawnRate: 2,
      resourceSpawnRate: 0.5,
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.creatureSpawnRate).toBe(2);
      expect(r.value.resourceSpawnRate).toBe(0.5);
    }
  });

  // E8.6/E8.8
  it("defaults colorblindRarity/tooltipVerbosity/reduceFlair to no-op values", () => {
    const s = defaultSettings();
    expect(s.colorblindRarity).toBe(false);
    expect(s.tooltipVerbosity).toBe("full");
    expect(s.reduceFlair).toBe(false);
  });

  it("accepts every declared tooltip verbosity", () => {
    for (const tooltipVerbosity of ["full", "compact"] as const) {
      expect(isOk(makeSettings(validInput({ tooltipVerbosity })))).toBe(true);
    }
  });

  it("rejects an unknown tooltip verbosity", () => {
    const r = makeSettings(validInput({ tooltipVerbosity: "essay" as never }));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("UnknownTooltipVerbosity");
  });

  it("updates colorblindRarity/tooltipVerbosity/reduceFlair while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), {
      colorblindRarity: true,
      tooltipVerbosity: "compact",
      reduceFlair: true,
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.colorblindRarity).toBe(true);
      expect(r.value.tooltipVerbosity).toBe("compact");
      expect(r.value.reduceFlair).toBe(true);
      expect(r.value.graphicsPreset).toBe(defaultSettings().graphicsPreset);
    }
  });

  it("updates a single bus volume while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { masterVolume: 0.2 });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.masterVolume).toBe(0.2);
      expect(r.value.musicVolume).toBe(defaultSettings().musicVolume);
    }
  });
});
