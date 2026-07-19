import { describe, expect, it } from "vitest";
import { grantXp, POINTS_PER_LEVEL, spawnLevelState, xpForEvent, xpForLevel } from "./Leveling";
import { PROGRESSION_EVENT_IDS } from "../progression/ProgressionEvents";

describe("Leveling", () => {
  it("spawns at level 1 with 0 xp", () => {
    const s = spawnLevelState();
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
  });

  it("xpForLevel grows with level (super-linear curve)", () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5) * 2);
  });

  it("grantXp accumulates xp below the next-level threshold without leveling", () => {
    const threshold = xpForLevel(1);
    const r = grantXp(spawnLevelState(), threshold - 1);
    expect(r.state.level).toBe(1);
    expect(r.state.xp).toBe(threshold - 1);
    expect(r.levelsGained).toBe(0);
    expect(r.pointsGranted).toBe(0);
  });

  it("grantXp levels up exactly at the threshold, carrying zero remainder", () => {
    const threshold = xpForLevel(1);
    const r = grantXp(spawnLevelState(), threshold);
    expect(r.state.level).toBe(2);
    expect(r.state.xp).toBe(0);
    expect(r.levelsGained).toBe(1);
    expect(r.pointsGranted).toBe(POINTS_PER_LEVEL);
  });

  it("grantXp rolls over multiple levels in a single large grant", () => {
    const bigAmount = xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + 5;
    const r = grantXp(spawnLevelState(), bigAmount);
    expect(r.state.level).toBe(4);
    expect(r.state.xp).toBe(5);
    expect(r.levelsGained).toBe(3);
    expect(r.pointsGranted).toBe(3 * POINTS_PER_LEVEL);
  });

  it("grantXp is a no-op identity for non-positive amounts", () => {
    const s = spawnLevelState();
    const r = grantXp(s, 0);
    expect(r.state).toBe(s);
    expect(r.levelsGained).toBe(0);
    const r2 = grantXp(s, -10);
    expect(r2.state).toBe(s);
  });

  it("every ProgressionEvents action id grants positive XP (no action feels wasted)", () => {
    for (const id of PROGRESSION_EVENT_IDS) {
      expect(xpForEvent(id)).toBeGreaterThan(0);
    }
  });

  it("kill and tame grant more xp than the token dig action (cozy: rarer/bigger actions pay more)", () => {
    expect(xpForEvent("kill")).toBeGreaterThan(xpForEvent("dig"));
    expect(xpForEvent("tame")).toBeGreaterThan(xpForEvent("dig"));
  });
});
