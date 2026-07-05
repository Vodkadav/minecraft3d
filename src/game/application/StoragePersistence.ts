/**
 * Ensure the origin's storage is exempt from eviction, requesting the permission
 * only when not already granted (idempotent — safe to call on every save). The
 * result is returned so the caller can surface the grant state in the UI.
 */

import type { PersistentStorage } from "./ports/PersistentStorage";

export interface PersistResult {
  readonly persisted: boolean;
  /** True when it was already granted, so no permission request was made. */
  readonly alreadyGranted: boolean;
}

export async function ensurePersistentStorage(
  storage: PersistentStorage,
): Promise<PersistResult> {
  if (await storage.isPersisted()) {
    return { persisted: true, alreadyGranted: true };
  }
  const persisted = await storage.requestPersist();
  return { persisted, alreadyGranted: false };
}
