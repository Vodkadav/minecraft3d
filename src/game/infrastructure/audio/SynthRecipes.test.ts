import { describe, expect, it } from "vitest";
import { AUDIO_EVENT_IDS } from "../../domain/audio/AudioEvents";
import { envelopeTimes, synthRecipeFor } from "./SynthRecipes";

describe("synthRecipeFor", () => {
  it("has a recipe for every declared audio event", () => {
    for (const id of AUDIO_EVENT_IDS) {
      const recipe = synthRecipeFor(id);
      expect(recipe.durationS).toBeGreaterThan(0);
      expect(["tone", "noise"]).toContain(recipe.kind);
    }
  });

  it("tone recipes carry finite, positive frequencies", () => {
    for (const id of AUDIO_EVENT_IDS) {
      const recipe = synthRecipeFor(id);
      if (recipe.kind !== "tone") continue;
      expect(recipe.freqStartHz).toBeGreaterThan(0);
      expect(recipe.freqEndHz).toBeGreaterThan(0);
    }
  });

  it("noise recipes carry a positive filter cutoff", () => {
    for (const id of AUDIO_EVENT_IDS) {
      const recipe = synthRecipeFor(id);
      if (recipe.kind !== "noise") continue;
      expect(recipe.filterHz).toBeGreaterThan(0);
    }
  });
});

describe("envelopeTimes", () => {
  it("orders start <= attack end <= release end", () => {
    const e = envelopeTimes(10, 0.2, 0.8);
    expect(e.startTime).toBe(10);
    expect(e.attackEndTime).toBeGreaterThanOrEqual(e.startTime);
    expect(e.releaseEndTime).toBeGreaterThanOrEqual(e.attackEndTime);
    expect(e.releaseEndTime).toBeCloseTo(10.2);
  });

  it("clamps the attack to at most half the duration for very short sounds", () => {
    const e = envelopeTimes(0, 0.01, 1, 0.05);
    expect(e.attackEndTime).toBeCloseTo(0.005);
  });

  it("carries the requested peak gain through unchanged", () => {
    expect(envelopeTimes(0, 1, 0.42).peak).toBe(0.42);
  });
});
