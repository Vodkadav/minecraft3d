// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MenuBackdrop } from "./MenuBackdrop";

describe("MenuBackdrop", () => {
  it("is decorative (hidden from assistive tech)", () => {
    const el = MenuBackdrop(1);
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders one drifting layer per skyline layer, each an SVG polygon", () => {
    const el = MenuBackdrop(1);
    const layers = el.querySelectorAll(".lw-menu-backdrop-layer");
    expect(layers.length).toBe(3);
    for (const layer of layers) {
      expect(layer.querySelector("svg polygon")).toBeTruthy();
    }
  });

  it("is deterministic for the same seed (same ridge points)", () => {
    const a = MenuBackdrop(7).querySelector("polygon")?.getAttribute("points");
    const b = MenuBackdrop(7).querySelector("polygon")?.getAttribute("points");
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });
});
