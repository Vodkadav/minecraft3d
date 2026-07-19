import { describe, expect, it } from "vitest";
import { NIGHT_END_HOUR, NIGHT_START_HOUR, isNight } from "./DayNight";
import {
  DEFAULT_DAY_LENGTH_SECONDS,
  createWorldClock,
  tickWorldClock,
  worldClockIsNight,
  worldClockPhase,
} from "./WorldClock";

describe("WorldClock", () => {
  it("defaults to hour 11 (matches the engine's existing ?T= default)", () => {
    expect(createWorldClock().hour).toBe(11);
  });

  it("normalizes an out-of-range start hour", () => {
    expect(createWorldClock(26).hour).toBe(2);
    expect(createWorldClock(-1).hour).toBe(23);
  });

  it("advances the hour proportionally to elapsed seconds and day length", () => {
    const clock = createWorldClock(0);
    const half = tickWorldClock(clock, DEFAULT_DAY_LENGTH_SECONDS / 2, DEFAULT_DAY_LENGTH_SECONDS);
    expect(half.hour).toBeCloseTo(12);
  });

  it("scales cycle speed with dayLengthSeconds — a shorter day advances faster for the same dt", () => {
    const clock = createWorldClock(0);
    const slow = tickWorldClock(clock, 60, 1200);
    const fast = tickWorldClock(clock, 60, 600);
    expect(fast.hour).toBeCloseTo(slow.hour * 2);
  });

  it("wraps around past hour 24", () => {
    const clock = createWorldClock(23);
    const advanced = tickWorldClock(clock, DEFAULT_DAY_LENGTH_SECONDS / 12, DEFAULT_DAY_LENGTH_SECONDS);
    expect(advanced.hour).toBeCloseTo(1);
  });

  it("wraps across multiple full days", () => {
    const clock = createWorldClock(0);
    const advanced = tickWorldClock(clock, DEFAULT_DAY_LENGTH_SECONDS * 2.25, DEFAULT_DAY_LENGTH_SECONDS);
    expect(advanced.hour).toBeCloseTo(6);
  });

  it("leaves the clock unchanged for zero dt", () => {
    const clock = createWorldClock(9);
    expect(tickWorldClock(clock, 0, DEFAULT_DAY_LENGTH_SECONDS)).toEqual(clock);
  });

  it("leaves the clock unchanged for a non-positive or non-finite day length", () => {
    const clock = createWorldClock(9);
    expect(tickWorldClock(clock, 10, 0)).toEqual(clock);
    expect(tickWorldClock(clock, 10, -5)).toEqual(clock);
    expect(tickWorldClock(clock, 10, Number.NaN)).toEqual(clock);
  });

  it("isNight matches DayNight.isNight for the clock's hour", () => {
    expect(worldClockIsNight(createWorldClock(12))).toBe(isNight(12));
    expect(worldClockIsNight(createWorldClock(NIGHT_START_HOUR))).toBe(true);
    expect(worldClockIsNight(createWorldClock(NIGHT_END_HOUR))).toBe(false);
  });

  it("phase is day at noon and night at midnight", () => {
    expect(worldClockPhase(createWorldClock(12))).toBe("day");
    expect(worldClockPhase(createWorldClock(0))).toBe("night");
  });

  it("phase transitions through dawn just after night ends", () => {
    expect(worldClockPhase(createWorldClock(NIGHT_END_HOUR))).toBe("dawn");
    expect(worldClockPhase(createWorldClock(NIGHT_END_HOUR + 1.9))).toBe("dawn");
    expect(worldClockPhase(createWorldClock(NIGHT_END_HOUR + 2))).toBe("day");
  });

  it("phase transitions through dusk just before night starts", () => {
    expect(worldClockPhase(createWorldClock(NIGHT_START_HOUR - 2))).toBe("dusk");
    expect(worldClockPhase(createWorldClock(NIGHT_START_HOUR - 0.1))).toBe("dusk");
    expect(worldClockPhase(createWorldClock(NIGHT_START_HOUR))).toBe("night");
  });
});
