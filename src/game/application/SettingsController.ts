/**
 * Use case for viewing and changing settings. Holds the current settings in
 * memory, validates every change through the domain factory, and persists via
 * the SettingsStore port. Invalid updates are rejected as Result values and
 * leave the current settings untouched (no partial application).
 */

import { isErr, ok, type Result } from "../domain/Result";
import {
  defaultSettings,
  updateSettings,
  type Settings,
  type SettingsInput,
} from "../domain/settings/Settings";
import type {
  SettingsStore,
  SettingsStoreError,
} from "./ports/SettingsStore";

export class SettingsController {
  private current: Settings = defaultSettings();

  constructor(private readonly store: SettingsStore) {}

  get settings(): Settings {
    return this.current;
  }

  async load(): Promise<Result<Settings, SettingsStoreError>> {
    const loaded = await this.store.load();
    if (isErr(loaded)) return loaded;
    this.current = loaded.value;
    return ok(this.current);
  }

  async apply(
    patch: Partial<SettingsInput>,
  ): Promise<Result<Settings, SettingsStoreError>> {
    const updated = updateSettings(this.current, patch);
    if (isErr(updated)) return updated;
    const saved = await this.store.save(updated.value);
    if (isErr(saved)) return saved;
    this.current = updated.value;
    return ok(this.current);
  }
}
