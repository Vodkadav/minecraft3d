// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createLocalizer } from "../i18n/strings";
import { mountAttackMeter } from "./AttackMeter";

const loc = createLocalizer("en");

describe("mountAttackMeter", () => {
  it("is mounted but hidden by default (full charge, nothing to show)", () => {
    const meter = mountAttackMeter(loc);
    expect(meter.visible).toBe(false);
    expect(meter.el.hidden).toBe(true);
    meter.dispose();
  });

  it("becomes visible once charge drops below full", () => {
    const meter = mountAttackMeter(loc);
    meter.render(0.4);
    expect(meter.visible).toBe(true);
    expect(meter.el.hidden).toBe(false);
    meter.dispose();
  });

  it("hides again once charge returns to full", () => {
    const meter = mountAttackMeter(loc);
    meter.render(0.4);
    meter.render(1);
    expect(meter.visible).toBe(false);
    expect(meter.el.hidden).toBe(true);
    meter.dispose();
  });

  it("reflects the charge fraction via aria-valuenow", () => {
    const meter = mountAttackMeter(loc);
    meter.render(0.5);
    expect(meter.el.getAttribute("aria-valuenow")).toBe("50");
    meter.dispose();
  });

  it("clamps an out-of-range charge instead of throwing", () => {
    const meter = mountAttackMeter(loc);
    expect(() => meter.render(5)).not.toThrow();
    expect(meter.el.getAttribute("aria-valuenow")).toBe("100");
    expect(() => meter.render(-5)).not.toThrow();
    expect(meter.el.getAttribute("aria-valuenow")).toBe("0");
    meter.dispose();
  });

  it("carries an aria-label from the localizer", () => {
    const meter = mountAttackMeter(loc);
    expect(meter.el.getAttribute("aria-label")).toBe(loc.t("combat.attackMeter.aria"));
    meter.dispose();
  });

  it("dispose removes the element", () => {
    const meter = mountAttackMeter(loc);
    meter.dispose();
    expect(document.querySelector(".lw-attack-meter")).toBeNull();
  });

  it("ships i18n copy for all three locales", () => {
    for (const locale of ["en", "es", "da"] as const) {
      const l = createLocalizer(locale);
      const meter = mountAttackMeter(l);
      expect(meter.el.getAttribute("aria-label")).toBe(l.t("combat.attackMeter.aria"));
      meter.dispose();
    }
  });
});
