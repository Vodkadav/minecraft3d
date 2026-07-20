import { describe, expect, it } from "vitest";
import { FOCUS_MAX, canCast, spawnFocus, spendFocus, tickFocus } from "./Focus";

describe("Focus (spellcasting resource)", () => {
  it("spawns full", () => {
    const f = spawnFocus();
    expect(f.focus).toBe(FOCUS_MAX);
    expect(canCast(f, 20)).toBe(true);
  });

  it("spawns at a given maxFocus instead of the default", () => {
    expect(spawnFocus(50).focus).toBe(50);
  });

  it("canCast is false when the pool doesn't cover the cost", () => {
    const f = { focus: 10 };
    expect(canCast(f, 20)).toBe(false);
    expect(canCast(f, 10)).toBe(true);
  });

  it("canCast rejects a negative cost outright (caller bug, not a free cast)", () => {
    expect(canCast(spawnFocus(), -5)).toBe(false);
  });

  it("spendFocus debits the pool on an affordable cast", () => {
    const f = spawnFocus();
    const spent = spendFocus(f, 30);
    expect(spent.focus).toBe(70);
  });

  it("spendFocus is a no-op (identity) when unaffordable — rejected, not clamped", () => {
    const f = { focus: 5 };
    expect(spendFocus(f, 20)).toBe(f);
  });

  it("tickFocus regenerates toward maxFocus and caps there", () => {
    const drained = { focus: 10 };
    const regened = tickFocus(drained, 5); // +45
    expect(regened.focus).toBe(55);
    const capped = tickFocus({ focus: 99 }, 5);
    expect(capped.focus).toBe(FOCUS_MAX);
  });

  it("tickFocus respects a custom maxFocus cap", () => {
    const capped = tickFocus({ focus: 45 }, 5, 50);
    expect(capped.focus).toBe(50);
  });

  it("tickFocus is a no-op for non-positive dt", () => {
    const f = { focus: 10 };
    expect(tickFocus(f, 0)).toBe(f);
    expect(tickFocus(f, -1)).toBe(f);
  });
});
