import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { emptyProgression, type ProgressionState } from "../progression/ProgressionState";
import {
  availableResearchPoints,
  canUnlockResearchNode,
  earnedResearchPoints,
  emptyResearchState,
  researchNodeStatus,
  researchTotalBonus,
  researchUnlockedTierFor,
  unlockResearchNode,
  type ResearchNode,
} from "./ResearchTree";

const NODES: readonly ResearchNode[] = [
  {
    id: "a",
    nameKey: "n.a",
    descKey: "d.a",
    branch: "gathering",
    cost: 1,
    prereqs: [],
    effect: { kind: "statBonus", stat: "gatherPower", amount: 0.1 },
  },
  {
    id: "b",
    nameKey: "n.b",
    descKey: "d.b",
    branch: "gathering",
    cost: 2,
    prereqs: ["a"],
    effect: { kind: "unlockTier", tier: 2 },
  },
  {
    id: "c",
    nameKey: "n.c",
    descKey: "d.c",
    branch: "gathering",
    cost: 3,
    prereqs: ["b"],
    effect: { kind: "statBonus", stat: "loot", amount: 0.2 },
  },
];

function progressionWithCounts(overrides: Partial<ProgressionState["counts"]> = {}): ProgressionState {
  const base = emptyProgression();
  return { ...base, counts: { ...base.counts, ...overrides } };
}

describe("emptyResearchState", () => {
  it("starts with nothing unlocked and nothing spent", () => {
    const s = emptyResearchState();
    expect(s.unlockedNodeIds).toEqual([]);
    expect(s.spentPoints).toBe(0);
  });
});

describe("earnedResearchPoints", () => {
  it("is 0 for a brand-new progression state", () => {
    expect(earnedResearchPoints(emptyProgression())).toBe(0);
  });

  it("earns 1 point per 5 gather-ish events (dig+harvest+craft)", () => {
    expect(earnedResearchPoints(progressionWithCounts({ dig: 4 }))).toBe(0);
    expect(earnedResearchPoints(progressionWithCounts({ dig: 5 }))).toBe(1);
    expect(earnedResearchPoints(progressionWithCounts({ dig: 3, harvest: 1, craft: 1 }))).toBe(1);
    expect(earnedResearchPoints(progressionWithCounts({ dig: 12 }))).toBe(2);
  });

  it("earns points from completed objectives (discovery) and unlocked achievements", () => {
    const base = emptyProgression();
    const withObjectives: ProgressionState = { ...base, completedObjectives: ["o1", "o2"] };
    expect(earnedResearchPoints(withObjectives)).toBe(4); // 2 objectives * 2 points

    const withAchievements: ProgressionState = { ...base, unlockedAchievements: ["ach1"] };
    expect(earnedResearchPoints(withAchievements)).toBe(3); // 1 achievement * 3 points
  });
});

describe("availableResearchPoints", () => {
  it("is earned minus spent, never negative", () => {
    const progression = progressionWithCounts({ dig: 10 }); // 2 earned
    expect(availableResearchPoints(progression, emptyResearchState())).toBe(2);
    expect(availableResearchPoints(progression, { unlockedNodeIds: ["a"], spentPoints: 1 })).toBe(1);
    expect(availableResearchPoints(progression, { unlockedNodeIds: [], spentPoints: 99 })).toBe(0);
  });
});

describe("unlockResearchNode", () => {
  it("unlocks a root node (no prereqs) when enough points are available", () => {
    const progression = progressionWithCounts({ dig: 5 }); // 1 point earned
    const r = unlockResearchNode(NODES, emptyResearchState(), progression, "a");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.unlockedNodeIds).toEqual(["a"]);
    expect(r.value.spentPoints).toBe(1);
  });

  it("rejects an unknown node id", () => {
    const progression = progressionWithCounts({ dig: 5 });
    const r = unlockResearchNode(NODES, emptyResearchState(), progression, "nope");
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "UnknownNode", nodeId: "nope" });
  });

  it("rejects re-unlocking an already-unlocked node", () => {
    const progression = progressionWithCounts({ dig: 10 });
    const first = unlockResearchNode(NODES, emptyResearchState(), progression, "a");
    if (!isOk(first)) throw new Error("setup");
    const again = unlockResearchNode(NODES, first.value, progression, "a");
    expect(isOk(again)).toBe(false);
    if (isOk(again)) return;
    expect(again.error).toEqual({ kind: "AlreadyUnlocked", nodeId: "a" });
  });

  it("rejects unlocking when prereqs aren't met, even with enough points", () => {
    const progression = progressionWithCounts({ dig: 50 }); // plenty of points
    const r = unlockResearchNode(NODES, emptyResearchState(), progression, "b");
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "PrereqsNotMet", nodeId: "b" });
  });

  it("rejects unlocking without enough points once prereqs are met", () => {
    const progression = progressionWithCounts({ dig: 5 }); // 1 point total
    const afterA = unlockResearchNode(NODES, emptyResearchState(), progression, "a"); // spends the 1 point
    if (!isOk(afterA)) throw new Error("setup");
    const insufficient = unlockResearchNode(NODES, afterA.value, progression, "b"); // costs 2, 0 left
    expect(isOk(insufficient)).toBe(false);
    if (isOk(insufficient)) return;
    expect(insufficient.error).toEqual({ kind: "InsufficientPoints", nodeId: "b", need: 2, have: 0 });
  });

  it("propagates a full prereq chain a -> b -> c as points accumulate", () => {
    const progression = progressionWithCounts({ dig: 30 }); // 6 points
    let state = emptyResearchState();
    for (const id of ["a", "b", "c"] as const) {
      const r = unlockResearchNode(NODES, state, progression, id);
      expect(isOk(r)).toBe(true);
      if (!isOk(r)) throw new Error("unexpected rejection");
      state = r.value;
    }
    expect(state.unlockedNodeIds).toEqual(["a", "b", "c"]);
    expect(state.spentPoints).toBe(6);
  });
});

describe("canUnlockResearchNode", () => {
  it("mirrors unlockResearchNode's ok/err verdict", () => {
    const progression = progressionWithCounts({ dig: 5 });
    expect(canUnlockResearchNode(NODES, emptyResearchState(), progression, "a")).toBe(true);
    expect(canUnlockResearchNode(NODES, emptyResearchState(), progression, "b")).toBe(false);
  });
});

describe("researchNodeStatus", () => {
  it("reports locked/affordable/unlocked correctly", () => {
    const progression = progressionWithCounts({ dig: 5 }); // 1 point
    expect(researchNodeStatus(NODES, emptyResearchState(), progression, "a")).toBe("affordable");
    expect(researchNodeStatus(NODES, emptyResearchState(), progression, "b")).toBe("locked"); // prereq unmet
    const afterA = unlockResearchNode(NODES, emptyResearchState(), progression, "a");
    if (!isOk(afterA)) throw new Error("setup");
    expect(researchNodeStatus(NODES, afterA.value, progression, "a")).toBe("unlocked");
    expect(researchNodeStatus(NODES, afterA.value, progression, "b")).toBe("locked"); // prereq met, no points left
  });
});

describe("researchUnlockedTierFor", () => {
  it("is the highest unlockTier effect among unlocked nodes, 0 if none", () => {
    expect(researchUnlockedTierFor(NODES, [])).toBe(0);
    expect(researchUnlockedTierFor(NODES, ["a"])).toBe(0); // a is a statBonus, not a tier gate
    expect(researchUnlockedTierFor(NODES, ["a", "b"])).toBe(2);
  });
});

describe("researchTotalBonus", () => {
  it("sums statBonus amounts of one kind among unlocked nodes only", () => {
    const state = { unlockedNodeIds: ["a", "b", "c"], spentPoints: 6 };
    expect(researchTotalBonus(NODES, state, "gatherPower")).toBe(0.1);
    expect(researchTotalBonus(NODES, state, "loot")).toBe(0.2);
    expect(researchTotalBonus(NODES, state, "attackPower")).toBe(0);
    expect(researchTotalBonus(NODES, emptyResearchState(), "gatherPower")).toBe(0);
  });
});
