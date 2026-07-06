import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { HiddenTreasure } from "./HiddenTreasure";
import { discover, emptyDiscovery, isDiscovered } from "./TreasureDiscovery";

const CHEST: HiddenTreasure = {
  id: "treasure:1:0:0",
  position: [4, 0, 4],
  tier: "rare",
  reward: [
    { itemId: "coin", count: 20 },
    { itemId: "gem", count: 1 },
  ],
};

describe("treasure discovery", () => {
  it("starts with nothing discovered", () => {
    expect(isDiscovered(emptyDiscovery(), CHEST.id)).toBe(false);
  });

  it("claiming a treasure yields its reward and records it", () => {
    const r = discover(emptyDiscovery(), CHEST);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.reward).toEqual(CHEST.reward);
      expect(isDiscovered(r.value.state, CHEST.id)).toBe(true);
    }
  });

  it("rejects claiming the same treasure twice", () => {
    const first = discover(emptyDiscovery(), CHEST);
    if (!isOk(first)) throw new Error("first claim failed");
    const second = discover(first.value.state, CHEST);
    expect(isErr(second)).toBe(true);
    if (isErr(second)) {
      expect(second.error.kind).toBe("AlreadyClaimed");
      expect(second.error.id).toBe(CHEST.id);
    }
  });

  it("does not mutate the prior state (immutability)", () => {
    const state0 = emptyDiscovery();
    const r = discover(state0, CHEST);
    if (!isOk(r)) throw new Error("claim failed");
    expect(state0).toEqual([]);
    expect(r.value.state).not.toBe(state0);
  });

  it("tracks multiple distinct treasures independently", () => {
    const other: HiddenTreasure = { ...CHEST, id: "treasure:1:1:0" };
    const first = discover(emptyDiscovery(), CHEST);
    if (!isOk(first)) throw new Error("claim failed");
    const second = discover(first.value.state, other);
    if (!isOk(second)) throw new Error("second claim failed");
    expect(isDiscovered(second.value.state, CHEST.id)).toBe(true);
    expect(isDiscovered(second.value.state, other.id)).toBe(true);
  });
});
