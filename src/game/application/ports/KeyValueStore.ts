/**
 * A string key/value store — the abstraction over IndexedDB for structured save
 * metadata (stored as JSON text). Faked in-memory for tests; the real adapter
 * is a thin IndexedDB wrapper.
 */

import type { Result } from "../../domain/Result";
import type { StorageError } from "./StorageError";

export interface KeyValueStore {
  put(key: string, value: string): Promise<Result<void, StorageError>>;
  get(key: string): Promise<Result<string, StorageError>>;
  delete(key: string): Promise<Result<void, StorageError>>;
  /** Keys beginning with `prefix`, in unspecified order. */
  keys(prefix: string): Promise<Result<readonly string[], StorageError>>;
}
