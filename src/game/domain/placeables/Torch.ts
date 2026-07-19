/**
 * Torch/lantern placeable (Workstream 8.1) — marker light config, not a
 * runtime state machine: a torch is lit the instant it's placed and stays
 * lit for its lifetime (no fuel/on-off modeled — YAGNI, nothing in the plan
 * asks for extinguishing). The render adapter paints a simple emissive/glow
 * mesh at these coordinates; real dynamic point-lights (8.2) are explicitly
 * deferred — they touch the shared lighting path and risk the prime
 * directive (never regress the base render) for a cosmetic gain this slice
 * doesn't need.
 */

export interface LightConfig {
  readonly colorHex: number;
  readonly radiusM: number;
}

export const TORCH_LIGHT: LightConfig = { colorHex: 0xffb347, radiusM: 6 };
export const LANTERN_LIGHT: LightConfig = { colorHex: 0xfff2c0, radiusM: 8 };
