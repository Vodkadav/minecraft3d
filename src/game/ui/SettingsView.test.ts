// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { isOk } from "../domain/Result";
import { InMemorySettingsStore } from "../infrastructure/persistence/InMemorySettingsStore";
import { SettingsController } from "../application/SettingsController";
import { createLocalizer } from "./i18n/strings";
import { SettingsView } from "./SettingsView";

const flush = () => new Promise((r) => setTimeout(r, 0));

async function build() {
  const store = new InMemorySettingsStore();
  const controller = new SettingsController(store);
  await controller.load();
  const el = SettingsView(controller, createLocalizer("en"));
  document.body.appendChild(el);
  return { store, controller, el };
}

function control<T extends HTMLElement>(el: HTMLElement, id: string): T {
  const found = el.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`no control #${id}`);
  return found;
}

describe("SettingsView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a graphics select that includes the mobile preset", async () => {
    const { el } = await build();
    const select = control<HTMLSelectElement>(el, "laas-graphics");
    const values = [...select.options].map((o) => o.value);
    expect(values).toEqual(["low", "mobile", "high", "ultra"]);
  });

  it("associates every control with a label", async () => {
    const { el } = await build();
    for (const id of [
      "laas-graphics",
      "laas-density",
      "laas-radius",
      "laas-locale",
      "laas-contrast",
      "laas-textscale",
      "laas-motion",
      "laas-vol-master",
      "laas-vol-music",
      "laas-vol-sfx",
      "laas-vol-ambient",
      "laas-difficulty",
      "laas-daylength",
      "laas-nameplate-mode",
      "laas-nameplate-friendly",
      "laas-nameplate-neutral",
      "laas-nameplate-hostile",
      "laas-nameplate-tamed",
      "laas-nameplate-players",
    ]) {
      const label = el.querySelector(`label[for="${id}"]`);
      expect(label, `label for ${id}`).toBeTruthy();
    }
  });

  it("flows an animal-density change through the controller and store", async () => {
    const { el, controller, store } = await build();
    const density = control<HTMLInputElement>(el, "laas-density");
    density.value = "0.2";
    density.dispatchEvent(new Event("change"));
    await flush();

    expect(controller.settings.animalDensity).toBeCloseTo(0.2);
    const reloaded = await store.load();
    if (isOk(reloaded)) expect(reloaded.value.animalDensity).toBeCloseTo(0.2);
  });

  it("flows the high-contrast toggle through the controller", async () => {
    const { el, controller } = await build();
    const toggle = control<HTMLInputElement>(el, "laas-contrast");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.settings.highContrast).toBe(true);
  });

  it("flows the boundary-radius change through the controller", async () => {
    const { el, controller } = await build();
    const radius = control<HTMLInputElement>(el, "laas-radius");
    radius.value = "1000";
    radius.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.settings.boundaryRadius).toBe(1000);
  });

  it("renders a difficulty select with all three tiers and flows changes through", async () => {
    const { el, controller } = await build();
    const select = control<HTMLSelectElement>(el, "laas-difficulty");
    expect([...select.options].map((o) => o.value)).toEqual(["peaceful", "normal", "hard"]);
    select.value = "hard";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.settings.difficulty).toBe("hard");
  });

  it("flows a day-length change (minutes -> seconds) through the controller and store", async () => {
    const { el, controller, store } = await build();
    const dayLength = control<HTMLInputElement>(el, "laas-daylength");
    dayLength.value = "10";
    dayLength.dispatchEvent(new Event("change"));
    await flush();

    expect(controller.settings.dayLengthSeconds).toBe(600);
    const reloaded = await store.load();
    if (isOk(reloaded)) expect(reloaded.value.dayLengthSeconds).toBe(600);
  });

  it("renders the four nameplate modes and flows a change through the controller", async () => {
    const { el, controller } = await build();
    const select = control<HTMLSelectElement>(el, "laas-nameplate-mode");
    expect([...select.options].map((o) => o.value)).toEqual([
      "always",
      "onHover",
      "inCombat",
      "off",
    ]);
    select.value = "onHover";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.settings.nameplateMode).toBe("onHover");
  });

  it("flows a nameplate faction toggle through the controller and store", async () => {
    const { el, controller, store } = await build();
    const hostile = control<HTMLInputElement>(el, "laas-nameplate-hostile");
    expect(hostile.checked).toBe(true); // cozy default: on
    hostile.checked = false;
    hostile.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.settings.nameplateHostile).toBe(false);
    const reloaded = await store.load();
    if (isOk(reloaded)) expect(reloaded.value.nameplateHostile).toBe(false);
  });

  it("flows a music-volume change through the controller and store", async () => {
    const { el, controller, store } = await build();
    const music = control<HTMLInputElement>(el, "laas-vol-music");
    music.value = "0.3";
    music.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.settings.musicVolume).toBeCloseTo(0.3);
    const reloaded = await store.load();
    if (isOk(reloaded)) expect(reloaded.value.musicVolume).toBeCloseTo(0.3);
  });
});
