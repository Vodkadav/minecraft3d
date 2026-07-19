import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "./Achievements";
import { TUTORIAL_OBJECTIVES } from "./Objectives";
import {
  currentObjective,
  emptyProgression,
  objectiveProgress,
  recordProgressionEvent,
  skipTutorial,
  unlockedTierFor,
  type Objective,
} from "./ProgressionState";

describe("emptyProgression", () => {
  it("starts every event count at 0 and nothing completed/unlocked", () => {
    const state = emptyProgression();
    expect(state.counts.dig).toBe(0);
    expect(state.counts.craft).toBe(0);
    expect(state.completedObjectives).toEqual([]);
    expect(state.unlockedAchievements).toEqual([]);
    expect(state.tutorialSkipped).toBe(false);
  });
});

describe("recordProgressionEvent — objective prereq ordering", () => {
  it("does not complete a later step before its prereq is met", () => {
    const state = emptyProgression();
    // craft before harvest: tut-craft's prereq (tut-harvest) isn't complete yet
    const r = recordProgressionEvent(state, "craft", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual([]);
    expect(r.state.completedObjectives).toEqual([]);
  });

  it("completes the chain in order across events", () => {
    let state = emptyProgression();
    let r = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual(["tut-harvest"]);
    state = r.state;

    r = recordProgressionEvent(state, "craft", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual(["tut-craft"]);
    state = r.state;

    r = recordProgressionEvent(state, "place", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual(["tut-place"]);
    state = r.state;

    r = recordProgressionEvent(state, "eat", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual(["tut-eat"]);
    state = r.state;

    r = recordProgressionEvent(state, "sleep", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual(["tut-sleep"]);
    expect(r.state.completedObjectives).toEqual([
      "tut-harvest",
      "tut-craft",
      "tut-place",
      "tut-eat",
      "tut-sleep",
    ]);
  });

  it("never re-completes an already-completed objective", () => {
    let state = emptyProgression();
    state = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, []).state;
    const r = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, []);
    expect(r.newlyCompletedObjectives).toEqual([]);
  });
});

describe("recordProgressionEvent — achievements", () => {
  it("unlocks a matching achievement exactly once", () => {
    let state = emptyProgression();
    const r1 = recordProgressionEvent(state, "dig", [], ACHIEVEMENTS);
    expect(r1.newlyUnlockedAchievements.map((a) => a.id)).toEqual(["first-dig"]);
    state = r1.state;

    const r2 = recordProgressionEvent(state, "dig", [], ACHIEVEMENTS);
    expect(r2.newlyUnlockedAchievements).toEqual([]);
  });

  it("unlocks builder-10 only once 10 places have happened", () => {
    let state = emptyProgression();
    for (let i = 0; i < 9; i++) {
      state = recordProgressionEvent(state, "place", [], ACHIEVEMENTS).state;
    }
    expect(state.unlockedAchievements).not.toContain("builder-10");
    const r = recordProgressionEvent(state, "place", [], ACHIEVEMENTS);
    expect(r.newlyUnlockedAchievements.map((a) => a.id)).toContain("builder-10");
  });

  it("tier-1-reached achievement fires off the tutorial-craft objective completing", () => {
    let state = emptyProgression();
    state = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, ACHIEVEMENTS).state;
    const r = recordProgressionEvent(state, "craft", TUTORIAL_OBJECTIVES, ACHIEVEMENTS);
    expect(r.newlyCompletedObjectives.map((o) => o.id)).toEqual(["tut-craft"]);
    expect(r.newlyUnlockedAchievements.map((a) => a.id)).toEqual(
      expect.arrayContaining(["first-craft", "tier-1-reached"]),
    );
  });
});

describe("unlockedTierFor", () => {
  it("is 0 with nothing completed", () => {
    expect(unlockedTierFor([], TUTORIAL_OBJECTIVES)).toBe(0);
  });

  it("reaches tier 1 once tut-craft is completed", () => {
    expect(unlockedTierFor(["tut-harvest", "tut-craft"], TUTORIAL_OBJECTIVES)).toBe(1);
  });

  it("ignores objectives with no reward", () => {
    expect(unlockedTierFor(["tut-harvest"], TUTORIAL_OBJECTIVES)).toBe(0);
  });
});

describe("currentObjective", () => {
  it("returns the first not-yet-completed, prereq-satisfied objective", () => {
    const state = emptyProgression();
    expect(currentObjective(state, TUTORIAL_OBJECTIVES)?.id).toBe("tut-harvest");
  });

  it("advances as objectives complete", () => {
    let state = emptyProgression();
    state = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, []).state;
    expect(currentObjective(state, TUTORIAL_OBJECTIVES)?.id).toBe("tut-craft");
  });

  it("is null once every objective is complete", () => {
    let state = emptyProgression();
    for (const event of ["harvest", "craft", "place", "eat", "sleep"] as const) {
      state = recordProgressionEvent(state, event, TUTORIAL_OBJECTIVES, []).state;
    }
    expect(currentObjective(state, TUTORIAL_OBJECTIVES)).toBeNull();
  });

  it("skips excluded ids (e.g. a skipped tutorial)", () => {
    const excluded = new Set(TUTORIAL_OBJECTIVES.map((o) => o.id));
    const state = emptyProgression();
    expect(currentObjective(state, TUTORIAL_OBJECTIVES, excluded)).toBeNull();
  });

  it("respects an objective list with an unmet-prereq gap", () => {
    const objectives: readonly Objective[] = [
      { id: "a", titleKey: "t", descKey: "d", prereqs: [], predicate: () => false },
      { id: "b", titleKey: "t", descKey: "d", prereqs: ["a"], predicate: () => true },
    ];
    const state = emptyProgression();
    // "a" never completes (predicate false), so "b" must never surface despite its predicate being true
    expect(currentObjective(state, objectives)?.id).toBe("a");
  });
});

describe("objectiveProgress", () => {
  it("is null for an objective with no progress metric", () => {
    const objective: Objective = { id: "a", titleKey: "t", descKey: "d", prereqs: [], predicate: () => true };
    expect(objectiveProgress(objective, emptyProgression().counts)).toBeNull();
  });

  it("reports current/target from the event count, clamped to target", () => {
    const objective = TUTORIAL_OBJECTIVES[0]!;
    let state = emptyProgression();
    expect(objectiveProgress(objective, state.counts)).toEqual({ current: 0, target: 1 });
    state = recordProgressionEvent(state, "harvest", TUTORIAL_OBJECTIVES, []).state;
    expect(objectiveProgress(objective, state.counts)).toEqual({ current: 1, target: 1 });
  });
});

describe("skipTutorial", () => {
  it("sets the flag without touching progress", () => {
    const state = emptyProgression();
    const skipped = skipTutorial(state);
    expect(skipped.tutorialSkipped).toBe(true);
    expect(skipped.completedObjectives).toEqual(state.completedObjectives);
  });
});
