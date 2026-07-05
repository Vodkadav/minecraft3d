import { describe, expect, it } from "vitest";
import type { Catalog } from "../../domain/i18n/translate";
import { Localizer } from "./Localizer";

const catalog: Catalog = {
  en: { play: "Play" },
  es: { play: "Jugar" },
  da: { play: "Spil" },
};

describe("Localizer", () => {
  it("translates through the active locale", () => {
    const loc = new Localizer(catalog, "es");
    expect(loc.t("play")).toBe("Jugar");
  });

  it("switches locale at runtime", () => {
    const loc = new Localizer(catalog, "en");
    loc.setLocale("da");
    expect(loc.activeLocale).toBe("da");
    expect(loc.t("play")).toBe("Spil");
  });

  it("exposes the available locales", () => {
    const loc = new Localizer(catalog);
    expect(loc.availableLocales().sort()).toEqual(["da", "en", "es"]);
  });
});
