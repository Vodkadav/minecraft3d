/**
 * Persistence port for the local seed vault. Lives with its consumer
 * (application); the in-memory adapter is the test/loopback implementation, and
 * a browser adapter can back it with the same KeyValueStore as the world index.
 *
 * Domain validation failures (invalid name, duplicate/absent id) flow through as
 * Result values; storage faults are the extra I/O branch.
 */

import type { Result } from "../../domain/Result";
import type {
  SeedEntry,
  SeedVaultError,
} from "../../domain/seedvault/SeedVault";

export type SeedVaultStoreError =
  | SeedVaultError
  | { readonly kind: "StorageUnavailable"; readonly detail: string };

export interface SeedVaultStore {
  add(entry: SeedEntry): Promise<Result<void, SeedVaultStoreError>>;
  rename(id: string, name: string): Promise<Result<void, SeedVaultStoreError>>;
  remove(id: string): Promise<Result<void, SeedVaultStoreError>>;
  list(): Promise<Result<readonly SeedEntry[], SeedVaultStoreError>>;
}
