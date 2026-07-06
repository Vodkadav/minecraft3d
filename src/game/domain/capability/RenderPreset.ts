/**
 * M1.6 boot preset resolution — the precedence for which render preset the
 * engine boots with when the URL carries no explicit `?preset=`:
 *   1. a mobile-reduced capability tier forces the reduced mobile path
 *      (a phone must never boot the full desktop pipeline);
 *   2. otherwise the player's persisted graphics setting;
 *   3. otherwise "high" (the engine's historical default).
 * Pure so the precedence is unit-testable; the composition root (main.ts)
 * supplies the tier probe and the persisted-settings load.
 */

import type { CapabilityTier } from "./CapabilityTier";
import type { GraphicsPreset } from "../settings/Settings";

export function resolveRenderPreset(
  tier: CapabilityTier,
  persisted: GraphicsPreset | null,
): GraphicsPreset {
  if (tier === "mobile-reduced") return "mobile";
  return persisted ?? "high";
}
