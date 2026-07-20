/**
 * E7.8 loot pools & difficulty scaling — pure engine tests. `rollLootPool`
 * must be a pure function of (pool, roll, danger): identical inputs always
 * produce identical output (multiplayer correctness — every peer resolving
 * the same roll agrees), and different inputs are free to diverge.
 */
import { describe, expect, it } from "vitest";
import {
  creatureTierFromStats,
  dangerScore,
  lootTierFor,
  rollLootPool,
  type LootPool,
} from "./LootTable";

const POOL: LootPool = [
  { itemId: "hide", min: 1, max: 1, tier: "common" },
  { itemId: "wolf-fang", min: 1, max: 2, tier: "rare" },
  { itemId: "sparkle-gem", min: 1, max: 1, tier: "legendary" },
];

describe("lootTierFor", () => {
  it("is deterministic for the same roll and danger", () => {
    expect(lootTierFor(0.5, 2)).toBe(lootTierFor(0.5, 2));
  });

  it("a low roll lands legendary at zero danger (base thresholds)", () => {
    expect(lootTierFor(0.01, 0)).toBe("legendary");
  });

  it("a mid roll lands rare at zero danger", () => {
    expect(lootTierFor(0.1, 0)).toBe("rare");
  });

  it("a high roll lands common at zero danger", () => {
    expect(lootTierFor(0.5, 0)).toBe("common");
  });

  it("higher danger widens the legendary/rare bands, never shrinks them", () => {
    // pick a roll that's "common" at zero danger, and confirm the tier it
    // resolves to only ever gets rarer (or stays) as danger climbs.
    const roll = 0.2;
    let prevRank = 0; // common=0, rare=1, legendary=2
    const rank = { common: 0, rare: 1, legendary: 2 } as const;
    for (let danger = 0; danger <= 5; danger++) {
      const r = rank[lootTierFor(roll, danger)];
      expect(r).toBeGreaterThanOrEqual(prevRank);
      prevRank = r;
    }
  });

  it("clamps negative danger to zero (never rarer than baseline)", () => {
    expect(lootTierFor(0.5, -3)).toBe(lootTierFor(0.5, 0));
  });
});

describe("rollLootPool", () => {
  it("returns null for an empty pool", () => {
    expect(rollLootPool([], 0.5, 0)).toBeNull();
  });

  it("is deterministic for the same roll and danger", () => {
    expect(rollLootPool(POOL, 0.42, 2)).toEqual(rollLootPool(POOL, 0.42, 2));
  });

  it("diverges across different rolls", () => {
    const results = new Set(
      [0.01, 0.15, 0.35, 0.55, 0.75, 0.95].map((r) => JSON.stringify(rollLootPool(POOL, r, 0))),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it("always returns an item from the pool, count within its min/max", () => {
    for (const roll of [0, 0.1, 0.33, 0.5, 0.66, 0.9, 0.999]) {
      const drop = rollLootPool(POOL, roll, 1);
      expect(drop).not.toBeNull();
      if (!drop) continue;
      const entry = POOL.find((e) => e.itemId === drop.itemId);
      expect(entry, `unexpected itemId ${drop.itemId}`).toBeDefined();
      if (!entry) continue;
      expect(drop.count).toBeGreaterThanOrEqual(entry.min);
      expect(drop.count).toBeLessThanOrEqual(entry.max);
    }
  });

  it("higher danger drops legendary/rare items more often across a fixed roll sample", () => {
    const rolls = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
    const isBonus = (roll: number, danger: number) => {
      const drop = rollLootPool(POOL, roll, danger);
      return drop?.itemId === "wolf-fang" || drop?.itemId === "sparkle-gem";
    };
    const lowDangerBonusCount = rolls.filter((r) => isBonus(r, 0)).length;
    const highDangerBonusCount = rolls.filter((r) => isBonus(r, 4)).length;
    expect(highDangerBonusCount).toBeGreaterThan(lowDangerBonusCount);
  });

  it("falls back to the pool's other tiers when the rolled tier has no entries", () => {
    const onlyCommon: LootPool = [{ itemId: "hide", min: 1, max: 1, tier: "common" }];
    const drop = rollLootPool(onlyCommon, 0.01, 5); // would roll legendary in a full pool
    expect(drop?.itemId).toBe("hide");
  });
});

describe("dangerScore", () => {
  it("peaceful + tier 0 + day is the floor", () => {
    expect(dangerScore({ difficulty: "peaceful", creatureTier: 0, isNight: false })).toBe(0);
  });

  it("normal difficulty and creature tier add linearly", () => {
    expect(dangerScore({ difficulty: "normal", creatureTier: 2, isNight: false })).toBe(3);
  });

  it("hard difficulty and night both add danger", () => {
    expect(dangerScore({ difficulty: "hard", creatureTier: 1, isNight: true })).toBe(4);
  });

  it("an optional biome danger multiplier scales the whole score", () => {
    expect(
      dangerScore({ difficulty: "normal", creatureTier: 1, isNight: false, biomeDangerMult: 2 }),
    ).toBe(4);
  });
});

describe("creatureTierFromStats", () => {
  it("bands maxHealth into 0..3", () => {
    expect(creatureTierFromStats({ maxHealth: 5 })).toBe(0);
    expect(creatureTierFromStats({ maxHealth: 20 })).toBe(1);
    expect(creatureTierFromStats({ maxHealth: 35 })).toBe(2);
    expect(creatureTierFromStats({ maxHealth: 60 })).toBe(3);
  });
});
