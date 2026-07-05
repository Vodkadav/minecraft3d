/**
 * Persistence port for worlds. Lives with its consumer (application); concrete
 * adapters live in infrastructure (OPFS blobs + IndexedDB index for the real
 * browser store; an in-memory adapter for tests and offline loopback).
 *
 * Expected failures are Result values, not thrown exceptions
 * (err-explicit-result-handling). `NotFound` is the only branch a caller must
 * routinely handle; `StorageUnavailable`/`Corrupt`/`QuotaExceeded` are edge I/O.
 */

import type { Result } from "../../domain/Result";
import type {
  WorldId,
  WorldSaveData,
  WorldSummary,
} from "../../domain/world/WorldSaveData";

export type SaveError =
  | { readonly kind: "NotFound"; readonly worldId: WorldId }
  | { readonly kind: "StorageUnavailable"; readonly detail: string }
  | { readonly kind: "QuotaExceeded" }
  | { readonly kind: "Corrupt"; readonly worldId: WorldId; readonly detail: string };

export interface WorldSaveStore {
  save(save: WorldSaveData): Promise<Result<void, SaveError>>;
  load(worldId: WorldId): Promise<Result<WorldSaveData, SaveError>>;
  list(): Promise<Result<readonly WorldSummary[], SaveError>>;
  delete(worldId: WorldId): Promise<Result<void, SaveError>>;
}
