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
});
