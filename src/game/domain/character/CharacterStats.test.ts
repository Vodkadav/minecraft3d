import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import {
  allocatePoint,
  emptyAttributes,
  emptyCharacterStats,
  grantStatPoints,
  lootMultiplier,
  maxEnergyMultiplier,
  maxHealthMultiplier,
  powerMultiplier,
  refundPoint,
  respecStats,
} from "./CharacterStats";

describe("CharacterStats", () => {
  it("starts with zeroed attributes and no unspent points by default", () => {
    const s = emptyCharacterStats();
    expect(s.attributes).toEqual(emptyAttributes());
    expect(s.unspentPoints).toBe(0);
  });

  it("allocatePoint spends one unspent point onto an attribute", () => {
    const s = grantStatPoints(emptyCharacterStats(), 2);
    const r = allocatePoint(s, "vigor");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.attributes.vigor).toBe(1);
    expect(r.value.unspentPoints).toBe(1);
  });

  it("allocatePoint rejects when no points are available (never goes negative)", () => {
    const r = allocatePoint(emptyCharacterStats(), "might");
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "NoPointsAvailable" });
  });

  it("refundPoint is free and returns the point to the unspent pool", () => {
    const s1 = grantStatPoints(emptyCharacterStats(), 1);
    const s2 = allocatePoint(s1, "endurance");
    if (!isOk(s2)) throw new Error("setup");
    const r = refundPoint(s2.value, "endurance");
    expect(isOk(r)).toBe(true);
    if (!isOk(r)) return;
    expect(r.value.attributes.endurance).toBe(0);
    expect(r.value.unspentPoints).toBe(1);
  });

  it("refundPoint rejects an attribute with nothing spent (never goes negative)", () => {
    const r = refundPoint(emptyCharacterStats(), "fortune");
    expect(isOk(r)).toBe(false);
    if (isOk(r)) return;
    expect(r.error).toEqual({ kind: "NothingToRefund", attribute: "fortune" });
  });

  it("never allows spending beyond the unspent budget across repeated allocations", () => {
    let s = grantStatPoints(emptyCharacterStats(), 3);
    for (let i = 0; i < 3; i++) {
      const r = allocatePoint(s, "might");
      if (!isOk(r)) throw new Error("unexpected rejection within budget");
      s = r.value;
    }
    expect(s.unspentPoints).toBe(0);
    const overspend = allocatePoint(s, "might");
    expect(isOk(overspend)).toBe(false);
  });

  it("respecStats fully refunds every spent point and resets attributes, conserving the total", () => {
    let s = grantStatPoints(emptyCharacterStats(), 5);
    for (const attr of ["vigor", "vigor", "might", "fortune"] as const) {
      const r = allocatePoint(s, attr);
      if (!isOk(r)) throw new Error("setup");
      s = r.value;
    }
    expect(s.unspentPoints).toBe(1);

    const respecced = respecStats(s);
    expect(respecced.attributes).toEqual(emptyAttributes());
    expect(respecced.unspentPoints).toBe(5);
  });

  it("grantStatPoints ignores non-positive amounts", () => {
    const s = emptyCharacterStats();
    expect(grantStatPoints(s, 0)).toBe(s);
    expect(grantStatPoints(s, -3)).toBe(s);
  });

  describe("only-add-power multipliers", () => {
    it("are exactly 1 at zero attributes (no regression for a stats-less save)", () => {
      const attrs = emptyAttributes();
      expect(maxHealthMultiplier(attrs)).toBe(1);
      expect(maxEnergyMultiplier(attrs)).toBe(1);
      expect(powerMultiplier(attrs)).toBe(1);
      expect(lootMultiplier(attrs)).toBe(1);
    });

    it("only ever increase with more points (cozy: additive-only)", () => {
      const base = emptyAttributes();
      const boosted = { vigor: 4, endurance: 3, might: 5, fortune: 2 };
      expect(maxHealthMultiplier(boosted)).toBeGreaterThan(maxHealthMultiplier(base));
      expect(maxEnergyMultiplier(boosted)).toBeGreaterThan(maxEnergyMultiplier(base));
      expect(powerMultiplier(boosted)).toBeGreaterThan(powerMultiplier(base));
      expect(lootMultiplier(boosted)).toBeGreaterThan(lootMultiplier(base));
    });
  });
});
