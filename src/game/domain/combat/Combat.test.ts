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
    const s0 = spawnCombatState("boar");
    expect(applyDamage(s0, 0).state).toEqual(s0);
    expect(applyDamage(s0, -3).state).toEqual(s0);
  });
});

describe("lootFor", () => {
  it("is deterministic for the same roll", () => {
    expect(lootFor("boar", 0.42)).toEqual(lootFor("boar", 0.42));
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
