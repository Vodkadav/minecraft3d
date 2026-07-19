// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Crosshair } from "./Crosshair";

describe("Crosshair", () => {
  it("mounts with the default state and is hidden from the a11y tree (purely visual)", () => {
    const crosshair = Crosshair();
    expect(crosshair.el.dataset.state).toBe("default");
    expect(crosshair.el.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.contains(crosshair.el)).toBe(true);
    crosshair.dispose();
  });

  it("setState reflects onto the DOM as a data attribute the stylesheet keys off", () => {
    const crosshair = Crosshair();
    for (const state of ["attack", "mine", "interact", "place", "default"] as const) {
      crosshair.setState(state);
      expect(crosshair.el.dataset.state).toBe(state);
    }
    crosshair.dispose();
  });

  it("dispose removes the element", () => {
    const crosshair = Crosshair();
    crosshair.dispose();
    expect(document.body.contains(crosshair.el)).toBe(false);
  });
});
