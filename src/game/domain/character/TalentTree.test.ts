import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import {
  activeBonuses,
  allocateTalent,
  canAllocateTalent,
  emptyTalentTree,
  grantTalentPoints,
  respecTalents,
  TALENT_NODES,
  totalBonus,
  type TalentNode,
} from "./TalentTree";

const NODES: readonly TalentNode[] = [
  {
    id: "a",
    nameKey: "n.a",
    descKey: "d.a",
    requiredLevel: 1,
    prereqs: [],
    bonus: { kind: "attackPower", amount: 0.1 },
  },
  {
    id: "b",
    nameKey: "n.b",
    descKey: "d.b",
    requiredLevel: 3,
    prereqs: ["a"],
    bonus: { kind: "maxHealth", amount: 0.2 },
  },
  {
    id: "c",
    nameKey: "n.c",
    descKey: "d.c",
    requiredLevel: 5,
    prereqs: ["b"],
    bonus: { kind: "loot", amount: 0.3 },
  },
];

describe("TalentTree", () => {
  it("starts empty with no ranks", () => {
    const s = emptyTalentTree();
    expect(s.ranks).toEqual({});
    expect(s.unspentPoints).toBe(0);
  });

  it("allocates a root node (no prereqs) once a point and the level gate are met", () => {
    const s = grantTalentPoints(emptyTalentTree(), 1);
    const r = allocateTalent(NODES, s, "a", 1);
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.ranks.a).toBe(1);
    expect(r.value.unspentPoints).toBe(0);
  });

  it("rejects allocation with no unspent points", () => {
    const r = allocateTalent(NODES, emptyTalentTree(), "a", 10);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "NoPointsAvailable" });
  });

  it("rejects allocation below the node's required level", () => {
    const s = grantTalentPoints(emptyTalentTree(), 1);
    const r = allocateTalent(NODES, s, "b", 2);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "LevelTooLow", nodeId: "b", requiredLevel: 3 });
  });

  it("rejects allocation when prereqs aren't met, even at sufficient level/points", () => {
    const s = grantTalentPoints(emptyTalentTree(), 1);
    const r = allocateTalent(NODES, s, "b", 10);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "PrereqsNotMet", nodeId: "b" });
  });

  it("propagates prereqs correctly across a full chain a -> b -> c", () => {
    let s = grantTalentPoints(emptyTalentTree(), 3);
    for (const [id, level] of [
      ["a", 1],
      ["b", 3],
      ["c", 5],
    ] as const) {
      const r = allocateTalent(NODES, s, id, level);
      expect(isOk(r)).toBe(true);
      if (!isOk(r)) throw new Error("unexpected rejection");
      s = r.value;
    }
    expect(s.ranks).toEqual({ a: 1, b: 1, c: 1 });
    expect(s.unspentPoints).toBe(0);
  });

  it("rejects an unknown node id", () => {
    const s = grantTalentPoints(emptyTalentTree(), 1);
    const r = allocateTalent(NODES, s, "nope", 10);
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "UnknownNode", nodeId: "nope" });
  });

  it("rejects re-allocating an already-maxed single-rank node", () => {
    let s = grantTalentPoints(emptyTalentTree(), 2);
    const first = allocateTalent(NODES, s, "a", 1);
    if (!isOk(first)) throw new Error("setup");
    s = first.value;
    const again = allocateTalent(NODES, s, "a", 1);
    expect(isOk(again)).toBe(false);
    if (isOk(again)) return;
    expect(again.error).toEqual({ kind: "AlreadyMaxRank", nodeId: "a" });
  });

  it("canAllocateTalent mirrors allocateTalent's ok/err verdict", () => {
    const s = grantTalentPoints(emptyTalentTree(), 1);
    expect(canAllocateTalent(NODES, s, "a", 1)).toBe(true);
    expect(canAllocateTalent(NODES, s, "b", 1)).toBe(false);
  });

  it("activeBonuses/totalBonus reflect only allocated nodes", () => {
    let s = grantTalentPoints(emptyTalentTree(), 1);
    const r = allocateTalent(NODES, s, "a", 1);
    if (!isOk(r)) throw new Error("setup");
    s = r.value;
    expect(activeBonuses(NODES, s)).toEqual([{ kind: "attackPower", amount: 0.1 }]);
    expect(totalBonus(NODES, s, "attackPower")).toBe(0.1);
    expect(totalBonus(NODES, s, "maxHealth")).toBe(0);
  });

  it("respecTalents fully restores every allocated point and clears ranks, conserving the total", () => {
    let s = grantTalentPoints(emptyTalentTree(), 3);
    for (const [id, level] of [
      ["a", 1],
      ["b", 3],
    ] as const) {
      const r = allocateTalent(NODES, s, id, level);
      if (!isOk(r)) throw new Error("setup");
      s = r.value;
    }
    expect(s.unspentPoints).toBe(1);

    const respecced = respecTalents(s);
    expect(respecced.ranks).toEqual({});
    expect(respecced.unspentPoints).toBe(3);
  });

  it("grantTalentPoints ignores non-positive amounts", () => {
    const s = emptyTalentTree();
    expect(grantTalentPoints(s, 0)).toBe(s);
    expect(grantTalentPoints(s, -2)).toBe(s);
  });

  describe("default TALENT_NODES data", () => {
    it("every prereq id refers to a real node in the tree", () => {
      const ids = new Set(TALENT_NODES.map((n) => n.id));
      for (const node of TALENT_NODES) {
        for (const prereq of node.prereqs) expect(ids.has(prereq)).toBe(true);
      }
    });

    it("has no duplicate node ids", () => {
      const ids = TALENT_NODES.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every bonus amount is strictly positive (cozy: additive-only)", () => {
      for (const node of TALENT_NODES) expect(node.bonus.amount).toBeGreaterThan(0);
    });
  });
});
