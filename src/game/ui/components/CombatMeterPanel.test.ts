// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mountCombatMeterPanel } from "./CombatMeterPanel";
import { createLocalizer } from "../i18n/strings";
import {
  LOCAL_PLAYER_SOURCE_ID,
  emptyCombatLog,
  foldCombatEvent,
} from "../../domain/combat/CombatLog";

const loc = createLocalizer("en");

describe("mountCombatMeterPanel", () => {
  it("is mounted but hidden by default (opt-in, OFF by default)", () => {
    const panel = mountCombatMeterPanel(loc);
    expect(panel.visible).toBe(false);
    expect((panel.el as HTMLElement).style.display).toBe("none");
    panel.dispose();
  });

  it("L toggles visibility", () => {
    const panel = mountCombatMeterPanel(loc);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
    expect(panel.visible).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
    expect(panel.visible).toBe(false);
    panel.dispose();
  });

  it("Escape closes it while open, but does nothing while already closed", () => {
    const panel = mountCombatMeterPanel(loc);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(panel.visible).toBe(false);
    panel.setVisible(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(panel.visible).toBe(false);
    panel.dispose();
  });

  it("other keys do not toggle it", () => {
    const panel = mountCombatMeterPanel(loc);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK" }));
    expect(panel.visible).toBe(false);
    panel.dispose();
  });

  it("the close button hides the panel", () => {
    const panel = mountCombatMeterPanel(loc);
    panel.setVisible(true);
    const closeBtn = panel.el.querySelector<HTMLButtonElement>("button")!;
    closeBtn.click();
    expect(panel.visible).toBe(false);
    panel.dispose();
  });

  it("shows the empty-state copy before any combat has happened", () => {
    const panel = mountCombatMeterPanel(loc);
    panel.render(emptyCombatLog(), 0);
    expect(panel.el.textContent).toContain(loc.t("combatLog.empty"));
    panel.dispose();
  });

  it("renders the local player's totals and DPS once combat has happened", () => {
    let state = emptyCombatLog();
    state = foldCombatEvent(state, {
      sourceId: LOCAL_PLAYER_SOURCE_ID,
      kind: "hitDealt",
      amount: 40,
      atMs: 0,
    });
    state = foldCombatEvent(state, {
      sourceId: LOCAL_PLAYER_SOURCE_ID,
      kind: "heal",
      amount: 5,
      atMs: 500,
    });
    state = foldCombatEvent(state, {
      sourceId: LOCAL_PLAYER_SOURCE_ID,
      kind: "kill",
      amount: 0,
      atMs: 1000,
    });

    const panel = mountCombatMeterPanel(loc);
    panel.render(state, 4000); // 40 dmg / 4s = 10 dps
    const text = panel.el.textContent ?? "";
    expect(text).toContain("40");
    expect(text).toContain("10.0");
    expect(text).toContain("5");
    expect(text).toContain("1");
    panel.dispose();
  });

  it("dispose removes the element and stops listening", () => {
    const panel = mountCombatMeterPanel(loc);
    panel.dispose();
    expect(document.querySelector(".lw-combat-meter")).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
  });

  it("ships i18n copy for all three locales", () => {
    for (const locale of ["en", "es", "da"] as const) {
      const l = createLocalizer(locale);
      const panel = mountCombatMeterPanel(l);
      expect(panel.el.textContent).toContain(l.t("combatLog.title"));
      panel.dispose();
    }
  });
});
