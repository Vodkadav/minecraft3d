import { describe, expect, it } from "vitest";
import { buffRemainingFraction, formatBuffTimer, tickBuffChips, type BuffChip } from "./BuffStripState";

function chip(overrides: Partial<BuffChip> = {}): BuffChip {
  return {
    id: "well-fed",
    nameKey: "buff.wellFed.name",
    kind: "buff",
    remainingMs: 10_000,
    durationMs: 20_000,
    ...overrides,
  };
}

describe("buffRemainingFraction", () => {
  it("is 0.5 halfway through", () => {
    expect(buffRemainingFraction(chip())).toBe(0.5);
  });

  it("clamps to 1 when remaining exceeds duration", () => {
    expect(buffRemainingFraction(chip({ remainingMs: 30_000, durationMs: 20_000 }))).toBe(1);
  });

  it("clamps to 0 for an expired/negative remainder", () => {
    expect(buffRemainingFraction(chip({ remainingMs: -500 }))).toBe(0);
  });

  it("reads 0 for a non-positive duration (no divide-by-zero)", () => {
    expect(buffRemainingFraction(chip({ durationMs: 0 }))).toBe(0);
  });
});

describe("tickBuffChips", () => {
  it("decrements remainingMs by dtMs", () => {
    const next = tickBuffChips([chip({ remainingMs: 5000 })], 1000);
    expect(next[0]?.remainingMs).toBe(4000);
  });

  it("drops chips that expire", () => {
    const next = tickBuffChips([chip({ remainingMs: 500 }), chip({ id: "other", remainingMs: 5000 })], 1000);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("other");
  });

  it("is a no-op for dtMs <= 0", () => {
    const chips = [chip()];
    expect(tickBuffChips(chips, 0)).toBe(chips);
    expect(tickBuffChips(chips, -100)).toBe(chips);
  });

  it("returns an empty array once every chip expires", () => {
    expect(tickBuffChips([chip({ remainingMs: 100 })], 200)).toEqual([]);
  });
});

describe("formatBuffTimer", () => {
  it("renders sub-minute remainders as seconds", () => {
    expect(formatBuffTimer(12_000)).toBe("12s");
  });

  it("rounds up to the next whole second", () => {
    expect(formatBuffTimer(1)).toBe("1s");
  });

  it("renders minute-plus remainders as m:ss", () => {
    expect(formatBuffTimer(65_000)).toBe("1:05");
  });

  it("floors non-positive remainders at 0s", () => {
    expect(formatBuffTimer(-500)).toBe("0s");
  });
});
