// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mountPerfHud } from "./PerfHud";

describe("mountPerfHud", () => {
  it("is mounted but hidden by default (opt-in, OFF by default)", () => {
    const hud = mountPerfHud();
    expect(hud.visible).toBe(false);
    hud.dispose();
  });

  it("F4 toggles visibility", () => {
    const hud = mountPerfHud();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "F4" }));
    expect(hud.visible).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "F4" }));
    expect(hud.visible).toBe(false);
    hud.dispose();
  });

  it("other keys do not toggle it", () => {
    const hud = mountPerfHud();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "F3" }));
    expect(hud.visible).toBe(false);
    hud.dispose();
  });

  it("renders percentiles once visible and sampled", () => {
    const hud = mountPerfHud();
    hud.setVisible(true);
    for (let i = 1; i <= 100; i++) hud.sample(i);
    // force a render tick (accumulator crosses the throttle threshold)
    hud.sample(1000);
    const el = document.querySelector(".lw-perf-hud");
    expect(el?.textContent).toMatch(/p50/);
    expect(el?.textContent).toMatch(/p95/);
    expect(el?.textContent).toMatch(/p99/);
    hud.dispose();
  });

  it("shows a placeholder before any sample lands", () => {
    const hud = mountPerfHud();
    hud.setVisible(true);
    const el = document.querySelector(".lw-perf-hud");
    expect(el?.textContent).toContain("warming up");
    hud.dispose();
  });

  it("dispose removes the element and stops listening", () => {
    const hud = mountPerfHud();
    hud.dispose();
    expect(document.querySelector(".lw-perf-hud")).toBeNull();
    // no throw after dispose
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "F4" }));
  });
});
