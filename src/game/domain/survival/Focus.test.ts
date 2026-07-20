import { describe, expect, it } from "vitest";
import { FOCUS_MAX, canCast, spawnFocus, spendFocus, tickFocus } from "./Focus";

describe("Focus (spellcasting resource, E7.3)", () => {
  it("spawns full", () => {
    const f = spawnFocus();
    expect(f.focus).toBe(FOCUS_MAX);
    expect(canCast(f, 30)).toBe(true);
  });

  it("spawns at a custom max when given one", () => {
    const f = spawnFocus(50);
    expect(f.focus).toBe(50);
  });

  it("canCast is true iff focus covers the cost", () => {
    const f = spawnFocus();
    expect(canCast(f, FOCUS_MAX)).toBe(true);
    expect(canCast(f, FOCUS_MAX + 1)).toBe(false);
  });

  it("spendFocus debits the cost", () => {
    const f = spendFocus(spawnFocus(), 30);
    expect(f.focus).toBe(FOCUS_MAX - 30);
  });

  it("spendFocus is a no-op when the cost can't be afforded — never goes negative", () => {
    const f = spawnFocus(10);
    const after = spendFocus(f, 30);
    expect(after.focus).toBe(10);
  });

  it("tickFocus regenerates over time, capped at max", () => {
    const drained = spendFocus(spawnFocus(), 50);
    const regened = tickFocus(drained, 2, FOCUS_MAX);
    expect(regened.focus).toBeGreaterThan(drained.focus);
    expect(regened.focus).toBeLessThanOrEqual(FOCUS_MAX);
  });

  it("tickFocus never exceeds the given max", () => {
    const after = tickFocus(spawnFocus(), 1000, FOCUS_MAX);
    expect(after.focus).toBe(FOCUS_MAX);
  });

  it("tickFocus defaults max to FOCUS_MAX when omitted", () => {
    const after = tickFocus(spawnFocus(), 1000);
    expect(after.focus).toBe(FOCUS_MAX);
  });

  it("a non-positive dt is a no-op, never drains or throws", () => {
    const f = spawnFocus(10);
    expect(tickFocus(f, 0).focus).toBe(10);
    expect(tickFocus(f, -1).focus).toBe(10);
  });
});
