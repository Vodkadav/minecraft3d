import { describe, expect, it } from "vitest";
import { damagePlayer, spawnPlayerVitals } from "../combat/PlayerVitals";
import { spawnSurvival } from "./Survival";
import { eat, isFood } from "./Eating";

describe("Eating", () => {
  it("isFood is true only when food metadata is present", () => {
    expect(isFood({ food: { hungerRestore: 10, healthRestore: 0 } })).toBe(true);
    expect(isFood({})).toBe(false);
  });

  it("restores hunger and health from a food item", () => {
    const vitals = damagePlayer(spawnPlayerVitals(), 30).state;
    const survival = { ...spawnSurvival(), hunger: 50 };
    const r = eat(vitals, survival, { hungerRestore: 20, healthRestore: 10 });
    expect(r.survival.hunger).toBe(70);
    expect(r.vitals.health).toBe(vitals.health + 10);
  });

  it("caps health restore at max", () => {
    const vitals = damagePlayer(spawnPlayerVitals(), 3).state;
    const r = eat(vitals, spawnSurvival(), { hungerRestore: 0, healthRestore: 50 });
    expect(r.vitals.health).toBe(100);
  });

  it("never heals a dead player", () => {
    const dead = damagePlayer({ ...spawnPlayerVitals(), health: 2 }, 5).state;
    expect(dead.dead).toBe(true);
    const r = eat(dead, spawnSurvival(), { hungerRestore: 10, healthRestore: 20 });
    expect(r.vitals).toBe(dead);
  });

  it("a zero-healthRestore food never touches vitals (reference-stable)", () => {
    const vitals = spawnPlayerVitals();
    const r = eat(vitals, spawnSurvival(), { hungerRestore: 15, healthRestore: 0 });
    expect(r.vitals).toBe(vitals);
  });
});
