/**
 * A flat binary key/value store — the abstraction over OPFS the save layer
 * needs. Keys are opaque strings (the WorldSaveStore namespaces them by world
 * id + chunk key); values are raw bytes. Faked in-memory for tests; the real
 * adapter is a thin OPFS wrapper.
 */

import type { Result } from "../../domain/Result";
import type { StorageError } from "./StorageError";

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<Result<void, StorageError>>;
  get(key: string): Promise<Result<Uint8Array, StorageError>>;
  delete(key: string): Promise<Result<void, StorageError>>;
  /** Keys beginning with `prefix`, in unspecified order. */
  keys(prefix: string): Promise<Result<readonly string[], StorageError>>;
}
