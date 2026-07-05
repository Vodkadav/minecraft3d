/**
 * Honest in-memory SettingsStore — used by tests and as the offline/loopback
 * store. Starts from domain defaults and clones on the way in/out so callers
 * can't mutate stored state through a shared reference.
 */

import { ok, type Result } from "../../domain/Result";
import { defaultSettings, type Settings } from "../../domain/settings/Settings";
import type {
  SettingsStore,
  SettingsStoreError,
} from "../../application/ports/SettingsStore";

export class InMemorySettingsStore implements SettingsStore {
  private current: Settings = defaultSettings();

  load(): Promise<Result<Settings, SettingsStoreError>> {
    return Promise.resolve(ok({ ...this.current }));
  }

  save(settings: Settings): Promise<Result<void, SettingsStoreError>> {
    this.current = { ...settings };
    return Promise.resolve(ok(undefined));
  }
}
