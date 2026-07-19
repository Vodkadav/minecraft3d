import { describe, expect, it } from "vitest";
import {
  HUNGER_MAX,
  STAMINA_MAX,
  STARVATION_DAMAGE_PER_S,
  canAttack,
  canSprint,
  drainStaminaForAttack,
  restoreHunger,
  spawnSurvival,
  starvationDamagePerTick,
  tickSurvival,
} from "./Survival";

describe("Survival (hunger + stamina)", () => {
  it("spawns full and ungated", () => {
    const s = spawnSurvival();
    expect(s.hunger).toBe(HUNGER_MAX);
    expect(s.stamina).toBe(STAMINA_MAX);
    expect(s.staminaGated).toBe(false);
    expect(canSprint(s)).toBe(true);
    expect(canAttack(s)).toBe(true);
  });

  it("decays hunger passively over time, not sprinting", () => {
    const after = tickSurvival(spawnSurvival(), 10, { sprinting: false });
    expect(after.hunger).toBeLessThan(HUNGER_MAX);
    expect(after.stamina).toBe(STAMINA_MAX); // already full, regen caps
  });

  it("sprinting drains stamina and adds extra hunger decay vs walking", () => {
    const walked = tickSurvival(spawnSurvival(), 2, { sprinting: false });
    const sprinted = tickSurvival(spawnSurvival(), 2, { sprinting: true });
    expect(sprinted.stamina).toBeLessThan(STAMINA_MAX);
    expect(sprinted.hunger).toBeLessThan(walked.hunger);
  });

  it("regenerates stamina when not sprinting", () => {
    const drained = tickSurvival(spawnSurvival(), 3, { sprinting: true });
    const regened = tickSurvival(drained, 5, { sprinting: false });
    expect(regened.stamina).toBeGreaterThan(drained.stamina);
  });

  it("peaceful (hungerRateMult 0) disables hunger decay entirely", () => {
    const after = tickSurvival(spawnSurvival(), 100, { sprinting: true, hungerRateMult: 0 });
    expect(after.hunger).toBe(HUNGER_MAX);
  });

  it("gates sprint/attack once stamina hits empty, and keeps the gate until recovery", () => {
    const s = tickSurvival(spawnSurvival(), 10, { sprinting: true }); // one big tick: drains past 0 in a single step
    expect(s.stamina).toBe(0);
    expect(s.staminaGated).toBe(true);
    expect(canSprint(s)).toBe(false);
    expect(canAttack(s)).toBe(false);

    // a single regen tick isn't enough to clear the gate
    const barelyRegened = tickSurvival(s, 0.1, { sprinting: false });
    expect(barelyRegened.staminaGated).toBe(true);

    // regenerating well past the recovery fraction clears it
    const recovered = tickSurvival(s, 10, { sprinting: false });
    expect(recovered.staminaGated).toBe(false);
    expect(canSprint(recovered)).toBe(true);
  });

  it("a gated player's sprint request costs nothing further (already effectively walking)", () => {
    const s = tickSurvival(spawnSurvival(), 10, { sprinting: true });
    expect(s.stamina).toBe(0);
    const still = tickSurvival(s, 1, { sprinting: true });
    // no further stamina loss possible, and it should regen since the
    // sprint request is ignored while gated
    expect(still.stamina).toBeGreaterThan(0);
  });

  it("drainStaminaForAttack spends stamina and hunger, and is a no-op when gated", () => {
    const s = spawnSurvival();
    const hit = drainStaminaForAttack(s);
    expect(hit.stamina).toBeLessThan(s.stamina);
    expect(hit.hunger).toBeLessThan(s.hunger);

    const gated = tickSurvival(s, 10, { sprinting: true });
    expect(canAttack(gated)).toBe(false);
    expect(drainStaminaForAttack(gated)).toBe(gated); // identity: rejected, not clamped
  });

  it("repeated attacks eventually gate stamina", () => {
    let s = spawnSurvival();
    for (let i = 0; i < 20; i++) s = drainStaminaForAttack(s);
    expect(s.stamina).toBe(0);
    expect(s.staminaGated).toBe(true);
  });

  it("starvation deals no damage above 0 hunger, and scales with dt at 0", () => {
    const fed = spawnSurvival();
    expect(starvationDamagePerTick(fed, 1)).toBe(0);

    const starving = { ...fed, hunger: 0 };
    expect(starvationDamagePerTick(starving, 1)).toBe(STARVATION_DAMAGE_PER_S);
    expect(starvationDamagePerTick(starving, 0.5)).toBeCloseTo(STARVATION_DAMAGE_PER_S * 0.5, 5);
  });

  it("restoreHunger caps at max and ignores non-positive amounts", () => {
    const hungry = { ...spawnSurvival(), hunger: 50 };
    expect(restoreHunger(hungry, 30).hunger).toBe(80);
    expect(restoreHunger(hungry, 1000).hunger).toBe(HUNGER_MAX);
    expect(restoreHunger(hungry, 0)).toBe(hungry);
    expect(restoreHunger(hungry, -5)).toBe(hungry);
  });
});
