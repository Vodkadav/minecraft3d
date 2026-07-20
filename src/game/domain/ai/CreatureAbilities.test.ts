/**
 * E7.6 monster-ability timing core: telegraphed windup fairness (a started
 * windup always completes), cooldown gating, and range-triggered starts.
 */
import { describe, expect, it } from "vitest";
import { IDLE_ABILITY_STATE, tickAbility, type AbilityState } from "./CreatureAbilities";

const SPEC = { range: 10, windupMs: 500, cooldownMs: 2000 };

describe("tickAbility", () => {
  it("stays idle out of range, even off cooldown", () => {
    const tick = tickAbility(SPEC, IDLE_ABILITY_STATE, 20, 100);
    expect(tick.action).toBe("idle");
  });

  it("starts a windup once in range and off cooldown", () => {
    const tick = tickAbility(SPEC, IDLE_ABILITY_STATE, 5, 100);
    expect(tick.action).toBe("windup");
    if (tick.action === "windup") expect(tick.progress).toBe(0);
    expect(tick.state.windupElapsedMs).toBe(0);
  });

  it("stays idle in range while cooldown is still running", () => {
    const state: AbilityState = { cooldownRemainingMs: 500, windupElapsedMs: null };
    const tick = tickAbility(SPEC, state, 5, 100);
    expect(tick.action).toBe("idle");
    expect(tick.state.cooldownRemainingMs).toBe(400);
  });

  it("advances an in-progress windup's progress toward 1", () => {
    const started = tickAbility(SPEC, IDLE_ABILITY_STATE, 5, 0);
    const mid = tickAbility(SPEC, started.state, 5, 250);
    expect(mid.action).toBe("windup");
    if (mid.action === "windup") expect(mid.progress).toBeCloseTo(0.5, 5);
  });

  it("a started windup completes even if the target leaves range", () => {
    const started = tickAbility(SPEC, IDLE_ABILITY_STATE, 5, 0);
    // target now far outside SPEC.range — the windup still runs to fire;
    // whether it actually lands is the caller's own hit test, not this gate.
    const mid = tickAbility(SPEC, started.state, 999, 300);
    expect(mid.action).toBe("windup");
    const fire = tickAbility(SPEC, mid.state, 999, 300);
    expect(fire.action).toBe("fire");
  });

  it("fires once the windup elapses and resets into the cooldown", () => {
    const started = tickAbility(SPEC, IDLE_ABILITY_STATE, 5, 0);
    const fire = tickAbility(SPEC, started.state, 5, 500);
    expect(fire.action).toBe("fire");
    expect(fire.state.cooldownRemainingMs).toBe(SPEC.cooldownMs);
    expect(fire.state.windupElapsedMs).toBeNull();
  });

  it("does not re-trigger a new windup immediately after firing (full cooldown)", () => {
    const started = tickAbility(SPEC, IDLE_ABILITY_STATE, 5, 0);
    const fire = tickAbility(SPEC, started.state, 5, 500);
    const next = tickAbility(SPEC, fire.state, 5, 10);
    expect(next.action).toBe("idle");
    expect(next.state.cooldownRemainingMs).toBe(SPEC.cooldownMs - 10);
  });

  it("a zero windupMs spec fires immediately (nothing to telegraph)", () => {
    const instant = { range: 10, windupMs: 0, cooldownMs: 1000 };
    const fire = tickAbility(instant, IDLE_ABILITY_STATE, 5, 0);
    expect(fire.action).toBe("fire");
    expect(fire.state.cooldownRemainingMs).toBe(1000);
  });
});
