// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createLocalizer } from "./i18n/strings";
import { CreditsScreen } from "./CreditsScreen";
import { TECH_CREDITS, ASSET_CREDITS } from "./creditsData";

describe("CreditsScreen", () => {
  it("lists every tech and asset credit as a linked entry", () => {
    const el = CreditsScreen(createLocalizer("en"));
    const links = [...el.querySelectorAll("a")].map((a) => a.textContent);
    for (const entry of [...TECH_CREDITS, ...ASSET_CREDITS]) {
      expect(links).toContain(entry.name);
    }
  });

  it("external links open safely (noopener, new tab)", () => {
    const el = CreditsScreen(createLocalizer("en"));
    const link = el.querySelector("a");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
  });

  it("calls onBack when Back is clicked", () => {
    const onBack = vi.fn();
    const el = CreditsScreen(createLocalizer("en"), onBack);
    const back = [...el.querySelectorAll("button")].find(
      (b) => b.textContent === "Back",
    );
    back?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("is localized (ES)", () => {
    const el = CreditsScreen(createLocalizer("es"));
    expect(el.querySelector("h1")?.textContent).toBe("Créditos");
  });
});
