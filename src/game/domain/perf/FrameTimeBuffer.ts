/**
 * Rolling frame-time buffer (Workstream 9.2) — a fixed-capacity ring of
 * recent per-frame durations (ms) feeding the opt-in perf HUD's p50/p95/p99
 * readout. Pure logic, renderer-free: the presentation adapter samples
 * `engine.stats.frameMs` each tick and calls `push`; percentiles are only
 * computed when the (opt-in, OFF by default) overlay actually renders.
 *
 * Deliberately NOT an immutable-state-threading module like ToastQueue/
 * FeelState: this is the one place explicitly re-profiled for the GC-hitch
 * audit itself, so the ring buffer is a preallocated Float64Array mutated in
 * place — `push` never allocates, which is the whole point of a perf tool
 * that must not be the hitch it's trying to catch.
 */

export interface FrameTimePercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  /** Number of samples the percentiles were computed over (0 = empty). */
  readonly count: number;
}

const EMPTY_PERCENTILES: FrameTimePercentiles = { p50: 0, p95: 0, p99: 0, count: 0 };

export class FrameTimeBuffer {
  private readonly values: Float64Array;
  private readonly scratch: Float64Array;
  private writeIndex = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    if (capacity <= 0) throw new Error("FrameTimeBuffer capacity must be > 0");
    this.values = new Float64Array(capacity);
    this.scratch = new Float64Array(capacity);
  }

  /** Record one frame's duration (ms). O(1), zero allocation. */
  push(ms: number): void {
    this.values[this.writeIndex] = ms;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled++;
  }

  get count(): number {
    return this.filled;
  }

  /** Nearest-rank p50/p95/p99 over the current window. Sorts a reused scratch
   *  copy — only called by the (throttled, opt-in) HUD render, not per-frame. */
  percentiles(): FrameTimePercentiles {
    const n = this.filled;
    if (n === 0) return EMPTY_PERCENTILES;
    for (let i = 0; i < n; i++) this.scratch[i] = this.values[i];
    const sorted = this.scratch.subarray(0, n);
    sorted.sort();
    return {
      p50: nearestRank(sorted, 0.5),
      p95: nearestRank(sorted, 0.95),
      p99: nearestRank(sorted, 0.99),
      count: n,
    };
  }
}

function nearestRank(sorted: Float64Array, p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] as number;
}
