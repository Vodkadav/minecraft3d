import { describe, expect, it } from "vitest";
import { TUTORIAL_OBJECTIVE_IDS, TUTORIAL_OBJECTIVES } from "./Objectives";

describe("TUTORIAL_OBJECTIVES", () => {
  it("matches the declared id list, in order", () => {
    expect(TUTORIAL_OBJECTIVES.map((o) => o.id)).toEqual([...TUTORIAL_OBJECTIVE_IDS]);
  });

  it("has unique ids", () => {
    const ids = TUTORIAL_OBJECTIVES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("forms a single linear chain — each step's prereq is exactly the previous step", () => {
    for (let i = 1; i < TUTORIAL_OBJECTIVES.length; i++) {
      expect(TUTORIAL_OBJECTIVES[i]!.prereqs).toEqual([TUTORIAL_OBJECTIVES[i - 1]!.id]);
    }
    expect(TUTORIAL_OBJECTIVES[0]!.prereqs).toEqual([]);
  });

  it("every objective references an existing i18n key pair (non-empty strings)", () => {
    for (const o of TUTORIAL_OBJECTIVES) {
      expect(o.titleKey.length).toBeGreaterThan(0);
      expect(o.descKey.length).toBeGreaterThan(0);
    }
  });

  it("exactly one objective carries the tier-1 recipe-unlock reward", () => {
    const rewarders = TUTORIAL_OBJECTIVES.filter((o) => o.reward?.kind === "unlockTier");
    expect(rewarders.map((o) => o.id)).toEqual(["tut-craft"]);
    expect(rewarders[0]!.reward).toEqual({ kind: "unlockTier", tier: 1 });
  });
});
