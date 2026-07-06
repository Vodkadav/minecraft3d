import { describe, expect, it } from "vitest";
import { resolveRenderPreset } from "./RenderPreset";

describe("resolveRenderPreset", () => {
  it("mobile-reduced tier forces the mobile preset", () => {
    expect(resolveRenderPreset("mobile-reduced", null)).toBe("mobile");
  });

  it("mobile-reduced tier wins over a persisted preset", () => {
    expect(resolveRenderPreset("mobile-reduced", "ultra")).toBe("mobile");
  });

  it("desktop-full uses the persisted preset when present", () => {
    expect(resolveRenderPreset("desktop-full", "low")).toBe("low");
    expect(resolveRenderPreset("desktop-full", "mobile")).toBe("mobile");
    expect(resolveRenderPreset("desktop-full", "ultra")).toBe("ultra");
  });

  it("desktop-full without a persisted preset defaults to high", () => {
    expect(resolveRenderPreset("desktop-full", null)).toBe("high");
  });

  it("unsupported (nogate escape hatch) behaves like desktop", () => {
    expect(resolveRenderPreset("unsupported", null)).toBe("high");
    expect(resolveRenderPreset("unsupported", "low")).toBe("low");
  });
});
