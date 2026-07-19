import { describe, expect, it } from "vitest";
import { FrameTimeBuffer } from "./FrameTimeBuffer";

describe("FrameTimeBuffer", () => {
  it("starts empty", () => {
    const buf = new FrameTimeBuffer(8);
    expect(buf.count).toBe(0);
    expect(buf.percentiles()).toEqual({ p50: 0, p95: 0, p99: 0, count: 0 });
  });

  it("rejects a non-positive capacity", () => {
    expect(() => new FrameTimeBuffer(0)).toThrow();
    expect(() => new FrameTimeBuffer(-1)).toThrow();
  });

  it("computes p50/p95/p99 over a simple 1..100 window (nearest-rank)", () => {
    const buf = new FrameTimeBuffer(100);
    for (let i = 1; i <= 100; i++) buf.push(i);
    const p = buf.percentiles();
    expect(p.count).toBe(100);
    expect(p.p50).toBe(50);
    expect(p.p95).toBe(95);
    expect(p.p99).toBe(99);
  });

  it("is order-independent — percentiles reflect the window's contents, not push order", () => {
    const buf = new FrameTimeBuffer(4);
    for (const v of [40, 10, 30, 20]) buf.push(v);
    const p = buf.percentiles();
    expect(p.p50).toBe(20);
  });

  it("evicts the oldest sample once capacity is exceeded (ring behaviour)", () => {
    const buf = new FrameTimeBuffer(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(100); // evicts the 1
    expect(buf.count).toBe(3);
    const p = buf.percentiles();
    expect(p.p50).toBe(3); // window is now [2, 3, 100]
  });

  it("a single sample reports that value for every percentile", () => {
    const buf = new FrameTimeBuffer(16);
    buf.push(16.7);
    const p = buf.percentiles();
    expect(p.p50).toBeCloseTo(16.7);
    expect(p.p95).toBeCloseTo(16.7);
    expect(p.p99).toBeCloseTo(16.7);
    expect(p.count).toBe(1);
  });

  it("repeated percentiles() calls do not mutate the underlying window", () => {
    const buf = new FrameTimeBuffer(5);
    for (const v of [5, 1, 4, 2, 3]) buf.push(v);
    const first = buf.percentiles();
    const second = buf.percentiles();
    expect(second).toEqual(first);
  });
});
