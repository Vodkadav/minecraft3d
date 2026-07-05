import { describe, expect, it } from "vitest";
import { classifyCapabilityTier } from "./CapabilityTier";

describe("classifyCapabilityTier", () => {
  it("desktop Chromium with a working adapter → desktop-full", () => {
    expect(
      classifyCapabilityTier({
        isMobile: false,
        isChromium: true,
        hasWebGpu: true,
        adapterOk: true,
      }).tier,
    ).toBe("desktop-full");
  });

  it("mobile Chromium with WebGPU → mobile-reduced", () => {
    expect(
      classifyCapabilityTier({
        isMobile: true,
        isChromium: true,
        hasWebGpu: true,
        adapterOk: true,
      }).tier,
    ).toBe("mobile-reduced");
  });

  it("non-Chromium → unsupported", () => {
    expect(
      classifyCapabilityTier({ isMobile: false, isChromium: false, hasWebGpu: true }).tier,
    ).toBe("unsupported");
  });

  it("Chromium without WebGPU (e.g. Advanced Protection) → unsupported", () => {
    expect(
      classifyCapabilityTier({ isMobile: true, isChromium: true, hasWebGpu: false }).tier,
    ).toBe("unsupported");
  });

  it("WebGPU present but no usable adapter → unsupported", () => {
    expect(
      classifyCapabilityTier({
        isMobile: false,
        isChromium: true,
        hasWebGpu: true,
        adapterOk: false,
      }).tier,
    ).toBe("unsupported");
  });

  it("defaults adapterOk to true when the async probe has not run yet", () => {
    expect(
      classifyCapabilityTier({ isMobile: false, isChromium: true, hasWebGpu: true }).tier,
    ).toBe("desktop-full");
  });
});
