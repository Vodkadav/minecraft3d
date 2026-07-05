import { describe, expect, it } from "vitest";
import { isOk } from "../../domain/Result";
import { defaultSettings } from "../../domain/settings/Settings";
import { InMemorySettingsStore } from "./InMemorySettingsStore";

describe("InMemorySettingsStore (SettingsStore contract)", () => {
  it("loads defaults before anything is saved", async () => {
    const store = new InMemorySettingsStore();
    const r = await store.load();
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual(defaultSettings());
  });

  it("saves and reads back settings", async () => {
    const store = new InMemorySettingsStore();
    const next = { ...defaultSettings(), highContrast: true, textScale: 1.6 };

    expect(isOk(await store.save(next))).toBe(true);
    const r = await store.load();

    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.highContrast).toBe(true);
      expect(r.value.textScale).toBe(1.6);
    }
  });
});
