import { describe, expect, it } from "vitest";
import { UI_STRINGS, createLocalizer } from "./strings";

describe("UI strings catalog", () => {
  it("ships EN, ES, and DA locales", () => {
    expect(Object.keys(UI_STRINGS).sort()).toEqual(["da", "en", "es"]);
  });

  it("has identical key sets across every locale (no missing translation)", () => {
    const en = Object.keys(UI_STRINGS.en).sort();
    for (const locale of Object.keys(UI_STRINGS)) {
      expect(Object.keys(UI_STRINGS[locale]).sort()).toEqual(en);
    }
  });

  it("has no empty string in any locale", () => {
    for (const locale of Object.keys(UI_STRINGS)) {
      for (const value of Object.values(UI_STRINGS[locale])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("createLocalizer resolves through the requested locale", () => {
    expect(createLocalizer("es").t("menu.settings")).toBe("Ajustes");
    expect(createLocalizer("da").t("menu.settings")).toBe("Indstillinger");
  });
});
