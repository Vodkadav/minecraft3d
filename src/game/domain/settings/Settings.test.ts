import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { DEFAULT_BOUNDARY_RADIUS } from "../boundary/Boundary";
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

  it("updates a single bus volume while keeping the rest", () => {
    const r = updateSettings(defaultSettings(), { masterVolume: 0.2 });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.masterVolume).toBe(0.2);
      expect(r.value.musicVolume).toBe(defaultSettings().musicVolume);
    }
  });
});
