import { describe, expect, it } from "vitest";
import { NIGHT_END_HOUR, NIGHT_START_HOUR, isNight } from "./DayNight";

describe("isNight", () => {
  it("is day at midday", () => {
    expect(isNight(12)).toBe(false);
  });

  it("is night exactly at NIGHT_START_HOUR and stays night up to but excluding NIGHT_END_HOUR", () => {
    expect(isNight(NIGHT_START_HOUR)).toBe(true);
    expect(isNight(23.99)).toBe(true);
    expect(isNight(0)).toBe(true);
    expect(isNight(NIGHT_END_HOUR - 0.01)).toBe(true);
  });

  it("is day exactly at NIGHT_END_HOUR", () => {
    expect(isNight(NIGHT_END_HOUR)).toBe(false);
  });

  it("wraps hours outside 0..24", () => {
    expect(isNight(24)).toBe(isNight(0));
    expect(isNight(-1)).toBe(isNight(23));
    expect(isNight(30)).toBe(isNight(6));
  });
});
