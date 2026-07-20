/**
 * M6.6 combat/death domain: health, damage, deterministic loot on death.
 * Pure — the engine adapter only forwards hits and reads the outcome.
 */
import { describe, expect, it } from "vitest";
import {
  applyDamage,
  CREATURE_STATS,
  lootFor,
  spawnCombatState,
} from "./Combat";

describe("creature stats registry", () => {
  it("covers every creature species in the spawn registry", async () => {
    const { SPAWN_SPECIES } = await import("../spawn/SpawnField");
    for (const sp of SPAWN_SPECIES.filter((s) => s.kind === "creature")) {
      expect(CREATURE_STATS[sp.id], `stats for ${sp.id}`).toBeDefined();
    }
  });
});

describe("applyDamage", () => {
  it("reduces health and reports alive below lethal", () => {
    const s0 = spawnCombatState("deer");
    const r = applyDamage(s0, 5);
    expect(r.state.health).toBe(s0.health - 5);
    expect(r.died).toBe(false);
  });

  it("clamps at zero and reports death exactly once", () => {
    const s0 = spawnCombatState("deer");
    const dead = applyDamage(s0, 9999);
    expect(dead.state.health).toBe(0);
    expect(dead.died).toBe(true);
    const again = applyDamage(dead.state, 5);
    expect(again.died).toBe(false); // already dead — no double death event
    expect(again.state.health).toBe(0);
  });

  it("ignores non-positive damage", () => {
    const s0 = spawnCombatState("wolf");
    expect(applyDamage(s0, 0).state).toEqual(s0);
    expect(applyDamage(s0, -3).state).toEqual(s0);
  });
});

describe("lootFor", () => {
  it("is deterministic for the same roll", () => {
    expect(lootFor("wolf", 0.42)).toEqual(lootFor("wolf", 0.42));
  });

  it("returns stacks within the species' loot rules", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      for (const stack of lootFor("deer", roll)) {
        expect(stack.count).toBeGreaterThan(0);
        expect(typeof stack.itemId).toBe("string");
      }
    }
  });

  it("unknown species yields nothing", () => {
    expect(lootFor("dragon", 0.5)).toEqual([]);
  });
});

describe("lootFor — E7.8 bonus loot pools", () => {
  it("a species with no pool entry is unaffected by context (identical to the flat-rule result)", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(lootFor("deer", roll, { difficulty: "hard", isNight: true })).toEqual(
        lootFor("deer", roll),
      );
    }
  });

  it("a species with a pool entry gets exactly one extra stack beyond its flat rules", () => {
    for (const roll of [0, 0.1, 0.33, 0.5, 0.66, 0.9, 0.999]) {
      const flatCount = CREATURE_STATS["wolf"]!.loot.length;
      expect(lootFor("wolf", roll).length).toBe(flatCount + 1);
    }
  });

  it("is deterministic for the same roll and context", () => {
    const ctx = { difficulty: "hard" as const, isNight: true };
    expect(lootFor("wolf", 0.37, ctx)).toEqual(lootFor("wolf", 0.37, ctx));
  });

  it("omitting context matches the explicit normal/day default", () => {
    expect(lootFor("wolf", 0.6)).toEqual(
      lootFor("wolf", 0.6, { difficulty: "normal", isNight: false }),
    );
  });

  it("harder difficulty/night skews the bonus drop toward rarer items across a roll sample", () => {
    const rolls = Array.from({ length: 100 }, (_, i) => (i + 0.5) / 100);
    const isRareOrBetter = (drop: ReturnType<typeof lootFor>) =>
      drop.some((s) => s.itemId === "wolf-fang" || s.itemId === "sparkle-gem");
    const easyCount = rolls.filter((r) =>
      isRareOrBetter(lootFor("wolf", r, { difficulty: "peaceful", isNight: false })),
    ).length;
    const hardCount = rolls.filter((r) =>
      isRareOrBetter(lootFor("wolf", r, { difficulty: "hard", isNight: true })),
    ).length;
    expect(hardCount).toBeGreaterThan(easyCount);
  });
});
