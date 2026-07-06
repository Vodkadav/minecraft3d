/**
 * M6.4 taming state machine: a multi-step feed sequence advances a wild
 * creature to tamed; wrong food or impatience (feeding during cooldown)
 * resets progress. Tamed beasts are rideable (the M6.5 [F] mount reads
 * `isRideable`).
 */
import { describe, expect, it } from "vitest";
import {
  feed,
  isRideable,
  startTaming,
  TAMING_RULES,
} from "./Taming";

const NOW = 1_000_000;

describe("taming a deer (3 feeds of berries, 5s cooldown)", () => {
  const rules = TAMING_RULES["deer"]!;

  it("advances one step per correct feed after the cooldown", () => {
    let s = startTaming("deer");
    s = feed(s, "berries", NOW).state;
    expect(s.progress).toBe(1);
    s = feed(s, "berries", NOW + rules.cooldownMs).state;
    expect(s.progress).toBe(2);
    const last = feed(s, "berries", NOW + 2 * rules.cooldownMs);
    expect(last.state.phase).toBe("tamed");
    expect(last.becameTamed).toBe(true);
  });

  it("rejects the wrong food and resets progress", () => {
    let s = startTaming("deer");
    s = feed(s, "berries", NOW).state;
    const r = feed(s, "meat", NOW + rules.cooldownMs);
    expect(r.state.progress).toBe(0);
    expect(r.state.phase).toBe("wild");
  });

  it("feeding during the cooldown resets progress (spooked)", () => {
    let s = startTaming("deer");
    s = feed(s, "berries", NOW).state;
    const r = feed(s, "berries", NOW + rules.cooldownMs - 1);
    expect(r.state.progress).toBe(0);
  });

  it("feeding a tamed creature is a no-op", () => {
    let s = startTaming("deer");
    s = feed(s, "berries", NOW).state;
    s = feed(s, "berries", NOW + rules.cooldownMs).state;
    s = feed(s, "berries", NOW + 2 * rules.cooldownMs).state;
    const r = feed(s, "berries", NOW + 3 * rules.cooldownMs);
    expect(r.state).toEqual(s);
    expect(r.becameTamed).toBe(false);
  });

  it("only tamed creatures are rideable", () => {
    let s = startTaming("deer");
    expect(isRideable(s)).toBe(false);
    s = feed(s, "berries", NOW).state;
    s = feed(s, "berries", NOW + rules.cooldownMs).state;
    s = feed(s, "berries", NOW + 2 * rules.cooldownMs).state;
    expect(isRideable(s)).toBe(true);
  });
});

describe("untameable species", () => {
  it("feeding a species without rules never advances", () => {
    const s = startTaming("wolf-king");
    const r = feed(s, "berries", NOW);
    expect(r.state.progress).toBe(0);
    expect(r.state.phase).toBe("wild");
  });
});
