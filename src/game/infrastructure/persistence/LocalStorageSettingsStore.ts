/**
 * Browser SettingsStore backed by localStorage. Thin glue: serialize to JSON on
 * save, re-validate through the domain factory on load so corrupt/older stored
 * data degrades to a typed error rather than a crash. Untested composition glue
 * (the behaviour is the domain factory + the platform API).
 */

import { err, isErr, ok, type Result } from "../../domain/Result";
import {
  defaultSettings,
  makeSettings,
  type Settings,
} from "../../domain/settings/Settings";
import type {
  SettingsStore,
  SettingsStoreError,
} from "../../application/ports/SettingsStore";

const STORAGE_KEY = "laas.game.settings.v1";

export class LocalStorageSettingsStore implements SettingsStore {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  load(): Promise<Result<Settings, SettingsStoreError>> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch (e) {
      return Promise.resolve(
        err({ kind: "StorageUnavailable", detail: String(e) }),
      );
    }
    if (raw === null) return Promise.resolve(ok(defaultSettings()));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return Promise.resolve(
        err({ kind: "StorageUnavailable", detail: `corrupt settings: ${e}` }),
      );
    }
    const validated = makeSettings(parsed as Settings);
    if (isErr(validated)) return Promise.resolve(validated);
    return Promise.resolve(ok(validated.value));
  }

  save(settings: Settings): Promise<Result<void, SettingsStoreError>> {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      return Promise.resolve(
        err({ kind: "StorageUnavailable", detail: String(e) }),
      );
    }
    return Promise.resolve(ok(undefined));
  }
}
