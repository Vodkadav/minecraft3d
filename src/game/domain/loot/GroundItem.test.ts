import { describe, expect, it } from "vitest";
import { groundItemId, isExpired, spawnGroundItem } from "./GroundItem";

describe("spawnGroundItem", () => {
  it("carries every field through as given", () => {
    const item = spawnGroundItem({
      id: "loot:1",
      itemId: "wood",
      count: 3,
      position: [1, 2, 3],
      spawnedAtMs: 1000,
      despawnAfterMs: 5000,
    });
    expect(item).toEqual({
      id: "loot:1",
      itemId: "wood",
      count: 3,
      position: [1, 2, 3],
      spawnedAtMs: 1000,
      despawnAfterMs: 5000,
    });
  });

  it("omits despawnAfterMs when not given (never auto-expires)", () => {
    const item = spawnGroundItem({
      id: "loot:2",
      itemId: "stone",
      count: 1,
      position: [0, 0, 0],
      spawnedAtMs: 0,
    });
    expect(item.despawnAfterMs).toBeUndefined();
  });
});

describe("isExpired", () => {
  const base = spawnGroundItem({
    id: "loot:1",
    itemId: "wood",
    count: 1,
    position: [0, 0, 0],
    spawnedAtMs: 1000,
    despawnAfterMs: 500,
  });

  it("is false before the deadline", () => {
    expect(isExpired(base, 1499)).toBe(false);
  });

  it("is true exactly at the deadline (inclusive)", () => {
    expect(isExpired(base, 1500)).toBe(true);
  });

  it("is true well past the deadline", () => {
    expect(isExpired(base, 9999)).toBe(true);
  });

  it("is always false with no despawn timer", () => {
    const eternal = spawnGroundItem({
      id: "loot:2",
      itemId: "wood",
      count: 1,
      position: [0, 0, 0],
      spawnedAtMs: 0,
    });
    expect(isExpired(eternal, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe("groundItemId", () => {
  it("is deterministic for the same source/item/index", () => {
    expect(groundItemId("creature:7", "wood", 0)).toBe(groundItemId("creature:7", "wood", 0));
  });

  it("differs by source, item, or index", () => {
    const base = groundItemId("creature:7", "wood", 0);
    expect(groundItemId("creature:8", "wood", 0)).not.toBe(base);
    expect(groundItemId("creature:7", "stone", 0)).not.toBe(base);
    expect(groundItemId("creature:7", "wood", 1)).not.toBe(base);
  });
});
