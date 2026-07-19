import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFICULTY_RULES, difficultyRules } from "./Difficulty";

describe("Difficulty", () => {
  it("peaceful has no hunger decay and no creature damage", () => {
    const r = difficultyRules("peaceful");
    expect(r.hungerRate).toBe(0);
    expect(r.creatureDamage).toBe(0);
    expect(r.deathPenalty).toBe("keep-inventory");
  });

  it("normal is the family-friendly default (keep-inventory, unscaled)", () => {
    const r = difficultyRules("normal");
    expect(r.hungerRate).toBe(1);
    expect(r.creatureDamage).toBe(1);
    expect(r.deathPenalty).toBe("keep-inventory");
  });

  it("hard scales both rates up and drops the hotbar on death", () => {
    const r = difficultyRules("hard");
    expect(r.hungerRate).toBeGreaterThan(1);
    expect(r.creatureDamage).toBeGreaterThan(1);
    expect(r.deathPenalty).toBe("drop-hotbar");
  });

  it("every declared difficulty has a rule entry", () => {
    for (const d of DIFFICULTIES) {
      expect(DIFFICULTY_RULES[d]).toBeDefined();
    }
  });
});
