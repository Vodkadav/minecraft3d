import { describe, expect, it } from "vitest";
import { DEFAULT_DAY_LENGTH_SECONDS } from "../domain/time/WorldClock";
import { WorldClockService, type WorldClockSink } from "./WorldClockService";

class RecordingSink implements WorldClockSink {
  readonly calls: number[] = [];
  setTimeOfDay(hour: number): void {
    this.calls.push(hour);
  }
}

describe("WorldClockService", () => {
  it("exposes the starting hour and pushes it to the sink on construction", () => {
    const sink = new RecordingSink();
    const svc = new WorldClockService(DEFAULT_DAY_LENGTH_SECONDS, 11, sink);
    expect(svc.hour).toBe(11);
    expect(sink.calls).toEqual([11]);
  });

  it("advances the hour on tick and pushes the new hour to the sink", () => {
    const sink = new RecordingSink();
    const svc = new WorldClockService(DEFAULT_DAY_LENGTH_SECONDS, 0, sink);
    svc.tick(DEFAULT_DAY_LENGTH_SECONDS / 2);
    expect(svc.hour).toBeCloseTo(12);
    expect(sink.calls.at(-1)).toBeCloseTo(12);
  });

  it("works with no sink attached", () => {
    const svc = new WorldClockService(DEFAULT_DAY_LENGTH_SECONDS, 0);
    expect(() => svc.tick(10)).not.toThrow();
    expect(svc.hour).toBeGreaterThan(0);
  });

  it("reflects isNight/phase from the current hour", () => {
    const svc = new WorldClockService(DEFAULT_DAY_LENGTH_SECONDS, 12);
    expect(svc.isNight).toBe(false);
    expect(svc.phase).toBe("day");
    svc.tick(DEFAULT_DAY_LENGTH_SECONDS / 2); // +12h -> midnight
    expect(svc.isNight).toBe(true);
    expect(svc.phase).toBe("night");
  });

  it("a shorter configured day length advances faster for the same dt", () => {
    const fast = new WorldClockService(600, 0);
    const slow = new WorldClockService(1200, 0);
    fast.tick(60);
    slow.tick(60);
    expect(fast.hour).toBeCloseTo(slow.hour * 2);
  });
});
