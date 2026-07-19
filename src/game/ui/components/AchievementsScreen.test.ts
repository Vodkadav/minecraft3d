// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../../domain/progression/Achievements";
import { createLocalizer } from "../i18n/strings";
import { AchievementsScreen } from "./AchievementsScreen";

describe("AchievementsScreen", () => {
  it("renders one card per achievement", () => {
    const screen = AchievementsScreen(createLocalizer("en"), ACHIEVEMENTS);
    expect(screen.el.querySelectorAll("[data-achievement-id]")).toHaveLength(ACHIEVEMENTS.length);
    screen.dispose();
  });

  it("shows locked description text before any unlock", () => {
    const screen = AchievementsScreen(createLocalizer("en"), ACHIEVEMENTS);
    screen.render([]);
    const card = screen.el.querySelector('[data-achievement-id="first-dig"]')!;
    expect(card.getAttribute("data-unlocked")).toBe("false");
    expect(card.textContent).toContain("Locked");
    screen.dispose();
  });

  it("reveals the real description once unlocked", () => {
    const screen = AchievementsScreen(createLocalizer("en"), ACHIEVEMENTS);
    screen.render(["first-dig"]);
    const card = screen.el.querySelector('[data-achievement-id="first-dig"]')!;
    expect(card.getAttribute("data-unlocked")).toBe("true");
    expect(card.textContent).toContain("Dig into the world for the first time.");
    screen.dispose();
  });

  it("keyboard-reachable: each card is tabbable", () => {
    const screen = AchievementsScreen(createLocalizer("en"), ACHIEVEMENTS);
    const card = screen.el.querySelector('[data-achievement-id="first-dig"]') as HTMLElement;
    expect(card.tabIndex).toBe(0);
    screen.dispose();
  });
});
