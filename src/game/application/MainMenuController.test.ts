import { describe, expect, it } from "vitest";
import { isOk } from "../domain/Result";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { MainMenuController } from "./MainMenuController";

function build() {
  const worlds = new InMemoryWorldSaveStore();
  let n = 0;
  const controller = new MainMenuController(worlds, {
    clock: () => 1000,
    idFactory: () => `w${++n}`,
  });
  return { worlds, controller };
}

describe("MainMenuController", () => {
  it("starts on the menu screen", () => {
    const { controller } = build();
    expect(controller.screen).toBe("menu");
    expect(controller.session).toBeNull();
  });

  it("opens the online lobby", () => {
    const { controller } = build();
    controller.openOnline();
    expect(controller.screen).toBe("lobby");
  });

  it("opens settings", () => {
    const { controller } = build();
    controller.openSettings();
    expect(controller.screen).toBe("settings");
  });

  it("opens credits", () => {
    const { controller } = build();
    controller.openCredits();
    expect(controller.screen).toBe("credits");
  });

  it("returns to the menu with back", () => {
    const { controller } = build();
    controller.openSettings();
    controller.back();
    expect(controller.screen).toBe("menu");
  });

  it("starts a solo loopback world from a chosen seed", async () => {
    const { controller, worlds } = build();

    const r = await controller.startSolo(7, "My World");

    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.mode).toBe("loopback");
      expect(controller.session).toEqual(r.value);
      expect(controller.screen).toBe("solo");
      const listed = await worlds.list();
      if (isOk(listed)) {
        expect(listed.value).toHaveLength(1);
        expect(listed.value[0].seed).toBe(7);
      }
    }
  });
});
