/**
 * Device capability tiering for the dual-path (desktop-full / mobile-reduced)
 * delivery. Pure classification: the engine's boot code gathers the raw probe
 * (device class, browser engine, WebGPU presence, adapter result) and this maps
 * it to a tier + a human reason. Renderer-free so it is unit-testable.
 *
 * ⚠️ Android-16 "Advanced Protection" can disable Chrome's WebGPU — that surfaces
 * as `hasWebGpu: false` or `adapterOk: false`, which classify to `unsupported`
 * with a clear reason rather than a crash (research §1).
 */

export type CapabilityTier = "desktop-full" | "mobile-reduced" | "unsupported";

export interface CapabilityProbe {
  readonly isMobile: boolean;
  readonly isChromium: boolean;
  readonly hasWebGpu: boolean;
  /** Whether a usable GPU adapter came up. Unknown before the async probe → true. */
  readonly adapterOk?: boolean;
}

export interface CapabilityResult {
  readonly tier: CapabilityTier;
  readonly reason: string;
}

export function classifyCapabilityTier(probe: CapabilityProbe): CapabilityResult {
  const adapterOk = probe.adapterOk ?? true;

  if (!probe.isChromium) {
    return {
      tier: "unsupported",
      reason: "Non-Chromium browser — the WebGPU features used here run only in Chrome/Chromium.",
    };
  }
  if (!probe.hasWebGpu) {
    return {
      tier: "unsupported",
      reason: "WebGPU is unavailable in this browser (may be disabled by policy, e.g. Android Advanced Protection).",
    };
  }
  if (!adapterOk) {
    return {
      tier: "unsupported",
      reason: "WebGPU is present but no usable GPU adapter came up.",
    };
  }
  if (probe.isMobile) {
    return {
      tier: "mobile-reduced",
      reason: "Mobile/tablet Chromium with WebGPU — eligible for the reduced-fidelity render path.",
    };
  }
  return { tier: "desktop-full", reason: "Desktop Chromium with a working WebGPU adapter." };
}
