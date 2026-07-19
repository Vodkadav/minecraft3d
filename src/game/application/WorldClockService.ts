/**
 * Application seam wiring the domain `WorldClock` into the engine's existing
 * time-of-day write seam (`LaasHooks.setTimeOfDay`, `src/core/Hooks.ts`).
 * The service owns no engine types — `WorldClockSink` is a local port shaped
 * exactly like `hooks.setTimeOfDay`, so the composition root (`src/main.ts`)
 * is the only place that ties this to the real hook, additively and without
 * this layer importing the engine (game-application-is-pure arch rule).
 *
 * `tick` is called once per frame from `engine.onUpdate` for menu-launched
 * (gameplay) worlds only — tooling/dev scene boots never construct this
 * service, so their static boot-time sky stays byte-identical.
 */

import {
  createWorldClock,
  tickWorldClock,
  worldClockIsNight,
  worldClockPhase,
  type ClockPhase,
  type WorldClock,
} from "../domain/time/WorldClock";

export interface WorldClockSink {
  setTimeOfDay(hour: number): void;
}

export class WorldClockService {
  private clock: WorldClock;

  constructor(
    private readonly dayLengthSeconds: number,
    startHour?: number,
    private readonly sink: WorldClockSink | null = null,
  ) {
    this.clock = createWorldClock(startHour);
    this.sink?.setTimeOfDay(this.clock.hour);
  }

  get hour(): number {
    return this.clock.hour;
  }

  get isNight(): boolean {
    return worldClockIsNight(this.clock);
  }

  get phase(): ClockPhase {
    return worldClockPhase(this.clock);
  }

  tick(dtSeconds: number): void {
    this.clock = tickWorldClock(this.clock, dtSeconds, this.dayLengthSeconds);
    this.sink?.setTimeOfDay(this.clock.hour);
  }
}
