import { describe, expect, it } from "vitest";
import {
  ENCOUNTER_TIMEOUT_MS,
  LOCAL_PLAYER_SOURCE_ID,
  dpsFor,
  emptyCombatLog,
  foldCombatEvent,
  isEncounterActive,
  sourceIds,
  totalsFor,
  type CombatLogState,
} from "./CombatLog";

const P = LOCAL_PLAYER_SOURCE_ID;

describe("CombatLog", () => {
  it("starts empty: no encounter, no sources", () => {
    const state = emptyCombatLog();
    expect(state.encounterStartMs).toBeNull();
    expect(state.lastEventMs).toBeNull();
    expect(sourceIds(state)).toEqual([]);
    expect(totalsFor(state, P)).toEqual({
      sourceId: P,
      damageDealt: 0,
      damageTaken: 0,
      healing: 0,
      kills: 0,
    });
  });

  it("the first event starts an encounter and accumulates its total", () => {
    const state = foldCombatEvent(emptyCombatLog(), {
      sourceId: P,
      kind: "hitDealt",
      amount: 10,
      atMs: 1000,
    });
    expect(state.encounterStartMs).toBe(1000);
    expect(state.lastEventMs).toBe(1000);
    expect(totalsFor(state, P).damageDealt).toBe(10);
  });

  it("accumulates multiple events for the same source within the window", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: 10, atMs: 0 });
    state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: 15, atMs: 500 });
    state = foldCombatEvent(state, { sourceId: P, kind: "hitTaken", amount: 5, atMs: 900 });
    state = foldCombatEvent(state, { sourceId: P, kind: "heal", amount: 8, atMs: 1200 });
    state = foldCombatEvent(state, { sourceId: P, kind: "kill", amount: 0, atMs: 1300 });

    expect(state.encounterStartMs).toBe(0);
    expect(state.lastEventMs).toBe(1300);
    const t = totalsFor(state, P);
    expect(t.damageDealt).toBe(25);
    expect(t.damageTaken).toBe(5);
    expect(t.healing).toBe(8);
    expect(t.kills).toBe(1);
  });

  it("tracks multiple sources independently within the same encounter (multi-source-ready fold)", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, { sourceId: "player", kind: "hitDealt", amount: 10, atMs: 0 });
    state = foldCombatEvent(state, { sourceId: "ally-1", kind: "hitDealt", amount: 30, atMs: 100 });
    state = foldCombatEvent(state, { sourceId: "player", kind: "kill", amount: 0, atMs: 200 });

    expect([...sourceIds(state)].sort()).toEqual(["ally-1", "player"]);
    expect(totalsFor(state, "player")).toEqual({
      sourceId: "player",
      damageDealt: 10,
      damageTaken: 0,
      healing: 0,
      kills: 1,
    });
    expect(totalsFor(state, "ally-1")).toEqual({
      sourceId: "ally-1",
      damageDealt: 30,
      damageTaken: 0,
      healing: 0,
      kills: 0,
    });
  });

  it("a gap of exactly ENCOUNTER_TIMEOUT_MS starts a new encounter and resets all totals", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: 999, atMs: 0 });
    state = foldCombatEvent(state, {
      sourceId: P,
      kind: "hitDealt",
      amount: 5,
      atMs: ENCOUNTER_TIMEOUT_MS,
    });

    expect(state.encounterStartMs).toBe(ENCOUNTER_TIMEOUT_MS);
    expect(totalsFor(state, P).damageDealt).toBe(5); // the 999 is gone, not carried over
  });

  it("a gap just under the timeout stays in the same encounter", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: 10, atMs: 0 });
    state = foldCombatEvent(state, {
      sourceId: P,
      kind: "hitDealt",
      amount: 5,
      atMs: ENCOUNTER_TIMEOUT_MS - 1,
    });

    expect(state.encounterStartMs).toBe(0);
    expect(totalsFor(state, P).damageDealt).toBe(15);
  });

  it("a source untouched across a reset drops out of sourceIds (no stale rows)", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, { sourceId: "ally-1", kind: "hitDealt", amount: 10, atMs: 0 });
    state = foldCombatEvent(state, {
      sourceId: P,
      kind: "hitDealt",
      amount: 5,
      atMs: ENCOUNTER_TIMEOUT_MS,
    });
    expect(sourceIds(state)).toEqual([P]);
  });

  it("clamps a negative/zero amount to a no-op delta rather than subtracting", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: 10, atMs: 0 });
    state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: -50, atMs: 10 });
    expect(totalsFor(state, P).damageDealt).toBe(10);
  });

  it("is immutable: folding never mutates the input state", () => {
    const before: CombatLogState = emptyCombatLog();
    const snapshotTotals = before.totals;
    foldCombatEvent(before, { sourceId: P, kind: "hitDealt", amount: 10, atMs: 0 });
    expect(before.totals).toBe(snapshotTotals);
    expect(before.encounterStartMs).toBeNull();
  });

  describe("isEncounterActive", () => {
    it("is false with no events yet", () => {
      expect(isEncounterActive(emptyCombatLog(), 0)).toBe(false);
    });

    it("is true right after an event and false once the timeout has fully elapsed", () => {
      const state = foldCombatEvent(emptyCombatLog(), {
        sourceId: P,
        kind: "hitDealt",
        amount: 1,
        atMs: 1000,
      });
      expect(isEncounterActive(state, 1000)).toBe(true);
      expect(isEncounterActive(state, 1000 + ENCOUNTER_TIMEOUT_MS - 1)).toBe(true);
      expect(isEncounterActive(state, 1000 + ENCOUNTER_TIMEOUT_MS)).toBe(false);
    });
  });

  describe("dpsFor", () => {
    it("is 0 before any encounter", () => {
      expect(dpsFor(emptyCombatLog(), P, 0)).toBe(0);
    });

    it("is 0 for a source with no totals in the current encounter", () => {
      const state = foldCombatEvent(emptyCombatLog(), {
        sourceId: "ally-1",
        kind: "hitDealt",
        amount: 10,
        atMs: 0,
      });
      expect(dpsFor(state, P, 1000)).toBe(0);
    });

    it("divides damage dealt by elapsed encounter seconds", () => {
      let state = emptyCombatLog();
      state = foldCombatEvent(state, { sourceId: P, kind: "hitDealt", amount: 100, atMs: 0 });
      expect(dpsFor(state, P, 5000)).toBeCloseTo(20); // 100 dmg / 5s
    });

    it("clamps elapsed time to a minimum so an instant hit isn't an absurd DPS", () => {
      const state = foldCombatEvent(emptyCombatLog(), {
        sourceId: P,
        kind: "hitDealt",
        amount: 100,
        atMs: 1000,
      });
      // nowMs == atMs -> elapsed 0s, clamped to the 1s floor
      expect(dpsFor(state, P, 1000)).toBeCloseTo(100);
    });
  });
});
