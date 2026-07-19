// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Bar } from "./Bar";

describe("Bar", () => {
  it("renders a labelled progressbar at the initial value", () => {
    const bar = Bar({ id: "hp", ariaLabel: "Health", labelText: "HP {n}/{max}", max: 100, initial: 100 });
    expect(bar.el.getAttribute("role")).toBe("progressbar");
    expect(bar.el.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.el.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.el.textContent).toContain("HP 100/100");
  });

  it("tweens toward a new target over successive ticks, never colour-only (label always present)", () => {
    const bar = Bar({ id: "hp2", ariaLabel: "Health", labelText: "HP {n}/{max}", max: 100, initial: 100 });
    bar.setTarget(20);
    for (let i = 0; i < 180; i++) bar.tick(1 / 60);
    expect(bar.el.getAttribute("aria-valuenow")).toBe("20");
    expect(bar.el.textContent).toContain("HP 20/100");
  });

  it("snap jumps immediately to the target", () => {
    const bar = Bar({ id: "hp3", ariaLabel: "Health", labelText: "HP {n}/{max}", max: 100, initial: 100 });
    bar.setTarget(10);
    bar.snap();
    expect(bar.el.getAttribute("aria-valuenow")).toBe("10");
  });

  it("marks the fill critical at/below the low-value threshold, suppressed under reduced motion", () => {
    const bar = Bar({
      id: "hp4",
      ariaLabel: "Health",
      labelText: "HP {n}/{max}",
      max: 100,
      initial: 20,
      reducedMotion: true,
    });
    const fill = bar.el.querySelector<HTMLElement>(".lw-bar-fill")!;
    expect(fill.dataset.critical).toBe("false");
  });

  it("pulses critical when motion is allowed and the value is low", () => {
    const bar = Bar({ id: "hp5", ariaLabel: "Health", labelText: "HP {n}/{max}", max: 100, initial: 20 });
    const fill = bar.el.querySelector<HTMLElement>(".lw-bar-fill")!;
    expect(fill.dataset.critical).toBe("true");
  });
});
