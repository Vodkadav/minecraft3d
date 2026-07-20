// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createLocalizer } from "../i18n/strings";
import { mountCastBar } from "./CastBar";

const loc = createLocalizer("en");

describe("mountCastBar", () => {
  it("is mounted but hidden by default (full focus, nothing to show)", () => {
    const bar = mountCastBar(loc);
    expect(bar.visible).toBe(false);
    expect(bar.el.hidden).toBe(true);
    bar.dispose();
  });

  it("becomes visible once focus drops below full", () => {
    const bar = mountCastBar(loc);
    bar.render(0.4);
    expect(bar.visible).toBe(true);
    expect(bar.el.hidden).toBe(false);
    bar.dispose();
  });

  it("hides again once focus returns to full", () => {
    const bar = mountCastBar(loc);
    bar.render(0.4);
    bar.render(1);
    expect(bar.visible).toBe(false);
    expect(bar.el.hidden).toBe(true);
    bar.dispose();
  });

  it("reflects the focus fraction via aria-valuenow", () => {
    const bar = mountCastBar(loc);
    bar.render(0.5);
    expect(bar.el.getAttribute("aria-valuenow")).toBe("50");
    bar.dispose();
  });

  it("clamps an out-of-range focus instead of throwing", () => {
    const bar = mountCastBar(loc);
    expect(() => bar.render(5)).not.toThrow();
    expect(bar.el.getAttribute("aria-valuenow")).toBe("100");
    expect(() => bar.render(-5)).not.toThrow();
    expect(bar.el.getAttribute("aria-valuenow")).toBe("0");
    bar.dispose();
  });

  it("carries an aria-label from the localizer", () => {
    const bar = mountCastBar(loc);
    expect(bar.el.getAttribute("aria-label")).toBe(loc.t("combat.castBar.aria"));
    bar.dispose();
  });

  it("dispose removes the element", () => {
    const bar = mountCastBar(loc);
    bar.dispose();
    expect(document.querySelector(".lw-cast-bar")).toBeNull();
  });

  it("ships i18n copy for all three locales", () => {
    for (const locale of ["en", "es", "da"] as const) {
      const l = createLocalizer(locale);
      const bar = mountCastBar(l);
      expect(bar.el.getAttribute("aria-label")).toBe(l.t("combat.castBar.aria"));
      bar.dispose();
    }
  });
});
