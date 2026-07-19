/**
 * Procedural silhouette generator for the main-menu backdrop (Workstream 10.2).
 * Pure and renderer-free: given a seed, deterministically produces ridge-line
 * heights for a small stack of parallax hill layers, the same seeded-hash
 * pattern already used for ore/gem/treasure placement (`domain/rng/hash`) —
 * reused here rather than inventing a second RNG scheme.
 */

import { hashUnitFloat } from "../rng/hash";

export interface SkylineLayer {
  /** Ridge heights left-to-right, normalized to [0, 1] (0 = valley, 1 = peak). */
  readonly heights: readonly number[];
  /** Base height (fraction of the layer's box, from the bottom) before the ridge adds on top. */
  readonly base: number;
}

/**
 * `layerCount` layers, back-to-front: later layers sit lower/flatter (base
 * rises, amplitude shrinks) to read as distance haze; `segments` control
 * points per layer make the ridge, looped (last point mirrors the first) so
 * the SVG polygon consuming this can tile seamlessly for a drifting parallax.
 */
export function generateSkyline(
  seed: number,
  layerCount: number,
  segments: number,
): readonly SkylineLayer[] {
  const layers: SkylineLayer[] = [];
  for (let layer = 0; layer < layerCount; layer++) {
    const depth = layerCount <= 1 ? 0 : layer / (layerCount - 1); // 0 = nearest, 1 = farthest
    const base = 0.05 + depth * 0.35;
    const amplitude = 0.5 - depth * 0.3;
    const heights: number[] = [];
    for (let i = 0; i < segments; i++) {
      const roll = hashUnitFloat(seed, layer, i);
      heights.push(base + roll * amplitude);
    }
    // close the loop so a tiled/translated copy lines up with no seam
    heights.push(heights[0]);
    layers.push({ heights, base });
  }
  return layers;
}
