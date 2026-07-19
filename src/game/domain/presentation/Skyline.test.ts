import { describe, expect, it } from "vitest";
import { generateSkyline } from "./Skyline";

describe("generateSkyline", () => {
  it("is deterministic for the same seed", () => {
    const a = generateSkyline(42, 3, 8);
    const b = generateSkyline(42, 3, 8);
    expect(a).toEqual(b);
  });

  it("differs for a different seed", () => {
    const a = generateSkyline(1, 3, 8);
    const b = generateSkyline(2, 3, 8);
    expect(a).not.toEqual(b);
  });

  it("produces the requested number of layers, each segments+1 points (closed loop)", () => {
    const layers = generateSkyline(7, 3, 8);
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      expect(layer.heights).toHaveLength(9);
      expect(layer.heights[0]).toBe(layer.heights[8]);
    }
  });

  it("keeps every height within [0, 1]", () => {
    const layers = generateSkyline(99, 4, 16);
    for (const layer of layers) {
      for (const h of layer.heights) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("farther layers sit at a higher base (distance haze)", () => {
    const layers = generateSkyline(3, 4, 8);
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].base).toBeGreaterThan(layers[i - 1].base);
    }
  });
});
