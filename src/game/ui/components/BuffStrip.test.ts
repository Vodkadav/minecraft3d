// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { BuffChip } from "../../domain/ui/BuffStripState";
import { createLocalizer } from "../i18n/strings";
import { BuffStrip } from "./BuffStrip";

const loc = createLocalizer("en");

const WELL_FED: BuffChip = {
  id: "well-fed",
  nameKey: "buff.wellFed.name",
  kind: "buff",
  remainingMs: 12_000,
  durationMs: 20_000,
};

describe("BuffStrip", () => {
  it("is hidden with no chips (nothing to show, matches AttackMeter/CastBar)", () => {
    const strip = BuffStrip(loc);
    expect(strip.el.hidden).toBe(true);
    strip.dispose();
  });

  it("becomes visible once chips are rendered", () => {
    const strip = BuffStrip(loc);
    strip.render([WELL_FED]);
    expect(strip.el.hidden).toBe(false);
    expect(strip.el.querySelectorAll(".lw-buff-chip")).toHaveLength(1);
    strip.dispose();
  });

  it("hides itself again once rendered with an empty list", () => {
    const strip = BuffStrip(loc);
    strip.render([WELL_FED]);
    strip.render([]);
    expect(strip.el.hidden).toBe(true);
    expect(strip.el.querySelectorAll(".lw-buff-chip")).toHaveLength(0);
    strip.dispose();
  });

  it("renders the countdown text via formatBuffTimer", () => {
    const strip = BuffStrip(loc);
    strip.render([WELL_FED]);
    expect(strip.el.querySelector(".lw-buff-chip-timer")?.textContent).toBe("12s");
    strip.dispose();
  });

  it("tags the chip element with its buff/debuff kind", () => {
    const strip = BuffStrip(loc);
    strip.render([{ ...WELL_FED, id: "chilled", kind: "debuff" }]);
    expect(strip.el.querySelector<HTMLElement>(".lw-buff-chip")?.dataset.kind).toBe("debuff");
    strip.dispose();
  });

  it("dispose removes the element", () => {
    const strip = BuffStrip(loc);
    strip.dispose();
    expect(strip.el.isConnected).toBe(false);
  });
});
