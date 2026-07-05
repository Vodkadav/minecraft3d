import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import {
  harvest,
  makeNode,
  nodeStatus,
  tick,
  type ResourceNodeType,
} from "./ResourceNode";

const TREE: ResourceNodeType = {
  id: "tree",
  yields: [{ itemId: "wood", min: 2, max: 4 }],
  respawnMs: 5000,
};

const PERMANENT_ROCK: ResourceNodeType = {
  id: "rock",
  yields: [{ itemId: "stone", min: 1, max: 1 }],
  respawnMs: 0,
};

describe("resource node gathering", () => {
  it("a fresh node is available", () => {
    expect(nodeStatus(makeNode(TREE))).toBe("available");
  });

  it("harvesting an available node yields items and depletes it", () => {
    const node = makeNode(TREE);
    const r = harvest(node, 0.5);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.yields).toEqual([{ itemId: "wood", count: 3 }]);
      expect(nodeStatus(r.value.node)).toBe("respawning");
    }
  });

  it("yields the minimum at roll 0 and the maximum near roll 1", () => {
    const low = harvest(makeNode(TREE), 0);
    const high = harvest(makeNode(TREE), 0.999);
    if (!isOk(low) || !isOk(high)) throw new Error("harvest failed");
    expect(low.value.yields[0].count).toBe(2);
    expect(high.value.yields[0].count).toBe(4);
  });

  it("clamps an out-of-range roll into yield bounds", () => {
    const under = harvest(makeNode(TREE), -1);
    const over = harvest(makeNode(TREE), 5);
    if (!isOk(under) || !isOk(over)) throw new Error("harvest failed");
    expect(under.value.yields[0].count).toBe(2);
    expect(over.value.yields[0].count).toBe(4);
  });

  it("rejects harvesting a depleted (respawning) node", () => {
    const first = harvest(makeNode(TREE), 0.5);
    if (!isOk(first)) throw new Error("first harvest failed");
    const second = harvest(first.value.node, 0.5);
    expect(isErr(second)).toBe(true);
    if (isErr(second)) expect(second.error.kind).toBe("NotHarvestable");
  });

  it("respawns to available once the timer elapses", () => {
    const harvested = harvest(makeNode(TREE), 0.5);
    if (!isOk(harvested)) throw new Error("harvest failed");
    let node = harvested.value.node;

    node = tick(node, 3000);
    expect(nodeStatus(node)).toBe("respawning");

    node = tick(node, 2000);
    expect(nodeStatus(node)).toBe("available");
  });

  it("ticking an available node is a no-op", () => {
    const node = makeNode(TREE);
    expect(tick(node, 10000)).toEqual(node);
  });

  it("a node with respawnMs 0 depletes permanently", () => {
    const harvested = harvest(makeNode(PERMANENT_ROCK), 0);
    if (!isOk(harvested)) throw new Error("harvest failed");
    const node = tick(harvested.value.node, 1_000_000);
    expect(nodeStatus(node)).toBe("depleted");
  });

  it("emits one yield entry per yield rule", () => {
    const berry: ResourceNodeType = {
      id: "bush",
      yields: [
        { itemId: "berry", min: 1, max: 3 },
        { itemId: "seed", min: 0, max: 2 },
      ],
      respawnMs: 1000,
    };
    const r = harvest(makeNode(berry), 0);
    if (!isOk(r)) throw new Error("harvest failed");
    expect(r.value.yields).toEqual([
      { itemId: "berry", count: 1 },
      { itemId: "seed", count: 0 },
    ]);
  });
});
