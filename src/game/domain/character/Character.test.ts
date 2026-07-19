import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import {
  allocateCharacterTalent,
  allocateStatPoint,
  effectiveAttackPowerMultiplier,
  effectiveGatherPowerMultiplier,
  effectiveLootMultiplier,
  effectiveMaxEnergyMultiplier,
  effectiveMaxHealthMultiplier,
  grantCharacterXp,
  grantXpForEvent,
  newCharacter,
  refundStatPoint,
  respecCharacterStats,
  respecCharacterTalents,
} from "./Character";
import { xpForLevel } from "./Leveling";

describe("Character aggregate", () => {
  it("newCharacter starts at level 1 with every multiplier exactly 1 (stats-less save parity)", () => {
    const c = newCharacter();
    expect(c.level.level).toBe(1);
    expect(c.stats.unspentPoints).toBe(0);
    expect(c.talents.unspentPoints).toBe(0);
    expect(effectiveMaxHealthMultiplier(c)).toBe(1);
    expect(effectiveMaxEnergyMultiplier(c)).toBe(1);
    expect(effectiveAttackPowerMultiplier(c)).toBe(1);
    expect(effectiveGatherPowerMultiplier(c)).toBe(1);
    expect(effectiveLootMultiplier(c)).toBe(1);
  });

  it("grantCharacterXp below threshold only advances xp, no points granted", () => {
    const c = newCharacter();
    const r = grantCharacterXp(c, xpForLevel(1) - 1);
    expect(r.levelsGained).toBe(0);
    expect(r.character.stats.unspentPoints).toBe(0);
    expect(r.character.talents.unspentPoints).toBe(0);
  });

  it("grantCharacterXp on level-up grants one stat point AND one talent point", () => {
    const c = newCharacter();
    const r = grantCharacterXp(c, xpForLevel(1));
    expect(r.levelsGained).toBe(1);
    expect(r.character.level.level).toBe(2);
    expect(r.character.stats.unspentPoints).toBe(1);
    expect(r.character.talents.unspentPoints).toBe(1);
  });

  it("grantXpForEvent reuses the ProgressionEvents vocabulary", () => {
    const c = newCharacter();
    const r = grantXpForEvent(c, "kill");
    expect(r.character.level.xp).toBeGreaterThan(0);
  });

  it("allocating a stat point raises its multiplier above 1", () => {
    const c = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const r = allocateStatPoint(c, "vigor");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(effectiveMaxHealthMultiplier(r.value)).toBeGreaterThan(1);
  });

  it("refundStatPoint is free and restores the multiplier to baseline", () => {
    let c = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const spent = allocateStatPoint(c, "vigor");
    if (!isOk(spent)) throw new Error("setup");
    c = spent.value;
    const refunded = refundStatPoint(c, "vigor");
    expect(isOk(refunded)).toBe(true);
    if (!isOk(refunded)) return;
    expect(effectiveMaxHealthMultiplier(refunded.value)).toBe(1);
    expect(refunded.value.stats.unspentPoints).toBe(1);
  });

  it("respecCharacterStats fully refunds stats without touching talents", () => {
    let c = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const spentStat = allocateStatPoint(c, "might");
    if (!isOk(spentStat)) throw new Error("setup");
    c = spentStat.value;
    const spentTalent = allocateCharacterTalent(c, "strongArms");
    if (!isOk(spentTalent)) throw new Error("setup");
    c = spentTalent.value;

    const respecced = respecCharacterStats(c);
    expect(respecced.stats.unspentPoints).toBe(1);
    expect(effectiveAttackPowerMultiplier(respecced)).toBeCloseTo(1.05, 5); // talent bonus survives
    expect(respecced.talents.ranks.strongArms).toBe(1);
  });

  it("respecCharacterTalents fully refunds talents without touching stats", () => {
    let c = grantCharacterXp(newCharacter(), xpForLevel(1)).character;
    const spentTalent = allocateCharacterTalent(c, "quickHands");
    if (!isOk(spentTalent)) throw new Error("setup");
    c = spentTalent.value;
    const spentStat = allocateStatPoint(c, "endurance");
    if (!isOk(spentStat)) throw new Error("setup");
    c = spentStat.value;

    const respecced = respecCharacterTalents(c);
    expect(respecced.talents.ranks).toEqual({});
    expect(respecced.talents.unspentPoints).toBe(1);
    expect(effectiveMaxEnergyMultiplier(respecced)).toBeGreaterThan(1); // stat bonus survives
  });

  it("allocateCharacterTalent gates on the character's live level", () => {
    const c = grantCharacterXp(newCharacter(), xpForLevel(1)).character; // now level 2
    const r = allocateCharacterTalent(c, "toughSkin"); // requires level 3
    expect(isOk(r)).toBe(false);
  });

  it("stacking a stat point and a matching talent compounds the effective multiplier", () => {
    let c = newCharacter();
    for (let i = 0; i < 5; i++) c = grantCharacterXp(c, xpForLevel(c.level.level)).character;
    const withStat = allocateStatPoint(c, "might");
    if (!isOk(withStat)) throw new Error("setup");
    c = withStat.value;
    const withTalent = allocateCharacterTalent(c, "strongArms");
    if (!isOk(withTalent)) throw new Error("setup");
    c = withTalent.value;

    // powerMultiplier(might=1) = 1.04, talent attackPower bonus = 0.05 -> 1.04 * 1.05
    expect(effectiveAttackPowerMultiplier(c)).toBeCloseTo(1.04 * 1.05, 5);
  });
});
