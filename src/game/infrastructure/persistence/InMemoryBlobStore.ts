/**
 * Honest in-memory BlobStore — obeys the same contract as the OPFS adapter, so
 * the composed WorldSaveStore can be exercised in Node. Copies bytes in and out
 * so callers can't mutate stored blobs through a shared reference.
 */

import { err, ok, type Result } from "../../domain/Result";
import type { BlobStore } from "../../application/ports/BlobStore";
import type { StorageError } from "../../application/ports/StorageError";

export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  put(key: string, bytes: Uint8Array): Promise<Result<void, StorageError>> {
    this.blobs.set(key, new Uint8Array(bytes));
    return Promise.resolve(ok(undefined));
  }

  get(key: string): Promise<Result<Uint8Array, StorageError>> {
    const found = this.blobs.get(key);
    if (found === undefined) return Promise.resolve(err({ kind: "NotFound", key }));
    return Promise.resolve(ok(new Uint8Array(found)));
  }

  delete(key: string): Promise<Result<void, StorageError>> {
    if (!this.blobs.delete(key)) return Promise.resolve(err({ kind: "NotFound", key }));
    return Promise.resolve(ok(undefined));
  }

  keys(prefix: string): Promise<Result<readonly string[], StorageError>> {
    const matching = [...this.blobs.keys()].filter((k) => k.startsWith(prefix));
    return Promise.resolve(ok(matching));
  }
}
