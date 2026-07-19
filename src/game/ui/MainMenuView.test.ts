// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { MainMenuController } from "../application/MainMenuController";
import type { LoopbackSession } from "../application/LoopbackSession";
import { createLocalizer } from "./i18n/strings";
import { MainMenuView } from "./MainMenuView";

function build() {
  const worlds = new InMemoryWorldSaveStore();
  const controller = new MainMenuController(worlds, {
    clock: () => 1000,
    idFactory: () => "w1",
  });
  const sessions: LoopbackSession[] = [];
  const el = MainMenuView(controller, createLocalizer("en"), (s) => sessions.push(s));
  document.body.appendChild(el);
  return { controller, el, sessions };
}

function button(el: HTMLElement, text: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found as HTMLButtonElement;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("MainMenuView", () => {
  it("renders localized Solo, Online, Settings, and Credits buttons", () => {
    const { el } = build();
    expect(button(el, "Solo (offline)")).toBeTruthy();
    expect(button(el, "Online")).toBeTruthy();
    expect(button(el, "Settings")).toBeTruthy();
    expect(button(el, "Credits")).toBeTruthy();
  });

  it("Credits opens credits via the controller", () => {
    const { controller, el } = build();
    button(el, "Credits").click();
    expect(controller.screen).toBe("credits");
  });

  it("renders the wordmark and a decorative backdrop", () => {
    const { el } = build();
    expect(el.querySelector(".lw-wordmark")?.getAttribute("aria-label")).toBe("Diggy World");
    expect(el.querySelector(".lw-menu-backdrop")).toBeTruthy();
  });

  it("Online opens the lobby via the controller", () => {
    const { controller, el } = build();
    button(el, "Online").click();
    expect(controller.screen).toBe("lobby");
  });

  it("Settings opens settings via the controller", () => {
    const { controller, el } = build();
    button(el, "Settings").click();
    expect(controller.screen).toBe("settings");
  });

  it("Solo starts a loopback world and reports the session", async () => {
    const { controller, el, sessions } = build();
    button(el, "Solo (offline)").click();
    await flush();
    expect(controller.screen).toBe("solo");
    expect(controller.session?.mode).toBe("loopback");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].worldId).toBe("w1");
  });
});
