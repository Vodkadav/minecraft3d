import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "./Achievements";
import { PROGRESSION_EVENT_IDS } from "./ProgressionEvents";
import { emptyProgression } from "./ProgressionState";

describe("ACHIEVEMENTS", () => {
  it("has at least 10 achievements", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers a first-* achievement for every progression event", () => {
    for (const event of PROGRESSION_EVENT_IDS) {
      const has = ACHIEVEMENTS.some((a) => a.id === `first-${event}`);
      expect(has, `missing first-${event} achievement`).toBe(true);
    }
  });

  it("none are unlocked on a fresh progression state", () => {
    const state = emptyProgression();
    const unlocked = ACHIEVEMENTS.filter((a) => a.predicate(state.counts, state));
    expect(unlocked).toEqual([]);
  });

  it("every achievement references non-empty i18n keys", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.titleKey.length).toBeGreaterThan(0);
      expect(a.descKey.length).toBeGreaterThan(0);
    }
  });
});
