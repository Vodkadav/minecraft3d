import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../domain/Result";
import { defaultSettings } from "../domain/settings/Settings";
import { InMemorySettingsStore } from "../infrastructure/persistence/InMemorySettingsStore";
import { SettingsController } from "./SettingsController";

describe("SettingsController", () => {
  it("loads current settings from the store", async () => {
    const store = new InMemorySettingsStore();
    await store.save({ ...defaultSettings(), reducedMotion: true });
    const controller = new SettingsController(store);

    const r = await controller.load();

    expect(isOk(r)).toBe(true);
    expect(controller.settings.reducedMotion).toBe(true);
  });

  it("applies a valid update, persists it, and exposes it", async () => {
    const store = new InMemorySettingsStore();
    const controller = new SettingsController(store);
    await controller.load();

    const r = await controller.apply({ animalDensity: 0.2, textScale: 1.3 });

    expect(isOk(r)).toBe(true);
    expect(controller.settings.animalDensity).toBe(0.2);
    const reloaded = await store.load();
    if (isOk(reloaded)) expect(reloaded.value.animalDensity).toBe(0.2);
  });

  it("rejects an invalid update without persisting or mutating current", async () => {
    const store = new InMemorySettingsStore();
    const controller = new SettingsController(store);
    await controller.load();
    const before = controller.settings;

    const r = await controller.apply({ animalDensity: 5 });

    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("DensityOutOfRange");
    expect(controller.settings).toEqual(before);
    const reloaded = await store.load();
    if (isOk(reloaded)) expect(reloaded.value.animalDensity).toBe(before.animalDensity);
  });
});
