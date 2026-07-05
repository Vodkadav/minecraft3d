/**
 * Persistence port for player settings. Lives with its consumer (application);
 * the in-memory adapter is the test/loopback implementation and a localStorage
 * adapter backs it in the browser. `load` yields defaults when nothing is
 * stored yet, so a first-run has valid settings without a special case.
 */

import type { Result } from "../../domain/Result";
import type { Settings, SettingsError } from "../../domain/settings/Settings";

export type SettingsStoreError =
  | SettingsError
  | { readonly kind: "StorageUnavailable"; readonly detail: string };

export interface SettingsStore {
  load(): Promise<Result<Settings, SettingsStoreError>>;
  save(settings: Settings): Promise<Result<void, SettingsStoreError>>;
}
