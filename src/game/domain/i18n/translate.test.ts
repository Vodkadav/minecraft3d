import { describe, expect, it } from "vitest";
import { type Catalog, translate } from "./translate";

const catalog: Catalog = {
  en: { greeting: "Hello", welcome: "Welcome, {name}", solo: "Solo" },
  es: { greeting: "Hola", welcome: "Bienvenido, {name}" },
  da: { greeting: "Hej" },
};

describe("translate", () => {
  it("resolves a key in the active locale", () => {
    expect(translate(catalog, "es", "greeting")).toBe("Hola");
  });

  it("interpolates named params", () => {
    expect(translate(catalog, "en", "welcome", { name: "Ana" })).toBe(
      "Welcome, Ana",
    );
  });

  it("falls back to the default locale when a key is missing", () => {
    expect(translate(catalog, "da", "solo")).toBe("Solo");
  });

  it("falls back to the key itself when missing everywhere", () => {
    expect(translate(catalog, "en", "no.such.key")).toBe("no.such.key");
  });

  it("leaves an unmatched placeholder intact", () => {
    expect(translate(catalog, "en", "welcome")).toBe("Welcome, {name}");
  });
});
