import { describe, expect, it } from "vitest";
import { hash32, hashUnitFloat } from "./hash";

describe("hash32", () => {
  it("is deterministic for the same inputs", () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(42)).toBe(hash32(42));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const args of [[0], [1, 2], [-7, 999999, 3], [2 ** 31]]) {
      const h = hash32(...args);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it("is order-sensitive", () => {
    expect(hash32(1, 2)).not.toBe(hash32(2, 1));
  });

  it("avalanches: a single-bit input change flips many output bits", () => {
    const a = hash32(0x1234, 7, 99);
    const b = hash32(0x1235, 7, 99);
    expect(a).not.toBe(b);
    let flipped = 0;
    for (let bit = 0; bit < 32; bit++) if (((a ^ b) >>> bit) & 1) flipped++;
    expect(flipped).toBeGreaterThanOrEqual(8); // far from a trivial ~1-bit change
  });

  it("distinguishes the empty list from a single zero", () => {
    expect(hash32()).not.toBe(hash32(0));
  });
});

describe("hashUnitFloat", () => {
  it("stays in [0, 1)", () => {
    for (let i = 0; i < 500; i++) {
      const u = hashUnitFloat(i, i * 31, 7);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it("is roughly uniform across the unit interval", () => {
    const buckets = new Array(10).fill(0);
    const n = 10000;
    for (let i = 0; i < n; i++) buckets[Math.floor(hashUnitFloat(i, 1234) * 10)]++;
    // each of 10 buckets expects ~1000; allow a generous ±35% band
    for (const count of buckets) {
      expect(count).toBeGreaterThan(650);
      expect(count).toBeLessThan(1350);
    }
  });
});
