/**
 * Graph-integrity test for the default research tree — mirrors
 * `crafting/RecipeGraph.test.ts`'s reachability pattern: every node is
 * either a root (no prereqs) or reachable by a prereq chain from a root, no
 * orphan prereq id, and no cycle.
 */

import { describe, expect, it } from "vitest";
import { RESEARCH_NODES } from "./starterResearchTree";

describe("starter research tree content gate", () => {
  it("has between 10 and 15 nodes across 2-3 branches", () => {
    expect(RESEARCH_NODES.length).toBeGreaterThanOrEqual(10);
    expect(RESEARCH_NODES.length).toBeLessThanOrEqual(15);
    const branches = new Set(RESEARCH_NODES.map((n) => n.branch));
    expect(branches.size).toBeGreaterThanOrEqual(2);
    expect(branches.size).toBeLessThanOrEqual(3);
  });

  it("has no duplicate node ids", () => {
    const ids = RESEARCH_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every prereq id refers to a real node in the tree (no orphan unlock)", () => {
    const ids = new Set(RESEARCH_NODES.map((n) => n.id));
    for (const node of RESEARCH_NODES) {
      for (const prereq of node.prereqs) {
        expect(ids.has(prereq), `node ${node.id} prereq ${prereq}`).toBe(true);
      }
    }
  });

  it("has at least one root node (no prereqs)", () => {
    const roots = RESEARCH_NODES.filter((n) => n.prereqs.length === 0);
    expect(roots.length).toBeGreaterThan(0);
  });

  it("every node is reachable from a root via its prereq chain (no unreachable node)", () => {
    const byId = new Map(RESEARCH_NODES.map((n) => [n.id, n]));
    const reachable = new Set(RESEARCH_NODES.filter((n) => n.prereqs.length === 0).map((n) => n.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of RESEARCH_NODES) {
        if (reachable.has(node.id)) continue;
        if (node.prereqs.every((id) => reachable.has(id))) {
          reachable.add(node.id);
          changed = true;
        }
      }
    }
    const unreachable = RESEARCH_NODES.filter((n) => !reachable.has(n.id)).map((n) => n.id);
    expect(unreachable).toEqual([]);
    // sanity: every id above was actually resolvable via byId (no dangling ref)
    expect(byId.size).toBe(RESEARCH_NODES.length);
  });

  it("has no prereq cycles (a node can never (transitively) require itself)", () => {
    const byId = new Map(RESEARCH_NODES.map((n) => [n.id, n]));
    function hasCycle(id: string, visiting: Set<string>): boolean {
      if (visiting.has(id)) return true;
      const node = byId.get(id);
      if (!node) return false;
      const next = new Set(visiting).add(id);
      return node.prereqs.some((p) => hasCycle(p, next));
    }
    for (const node of RESEARCH_NODES) {
      expect(hasCycle(node.id, new Set()), `cycle detected reachable from ${node.id}`).toBe(false);
    }
  });

  it("every statBonus effect amount is strictly positive (cozy: additive-only)", () => {
    for (const node of RESEARCH_NODES) {
      if (node.effect.kind === "statBonus") {
        expect(node.effect.amount, node.id).toBeGreaterThan(0);
      }
    }
  });

  it("every unlockTier effect is a positive tier", () => {
    for (const node of RESEARCH_NODES) {
      if (node.effect.kind === "unlockTier") {
        expect(node.effect.tier, node.id).toBeGreaterThan(0);
      }
    }
  });
});
