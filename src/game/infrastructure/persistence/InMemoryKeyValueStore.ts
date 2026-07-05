/**
 * Honest in-memory KeyValueStore — mirrors the IndexedDB adapter's contract so
 * the composed WorldSaveStore can be tested in Node.
 */

import { err, ok, type Result } from "../../domain/Result";
import type { KeyValueStore } from "../../application/ports/KeyValueStore";
import type { StorageError } from "../../application/ports/StorageError";

export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  put(key: string, value: string): Promise<Result<void, StorageError>> {
    this.entries.set(key, value);
    return Promise.resolve(ok(undefined));
  }

  get(key: string): Promise<Result<string, StorageError>> {
    const found = this.entries.get(key);
    if (found === undefined) return Promise.resolve(err({ kind: "NotFound", key }));
    return Promise.resolve(ok(found));
  }

  delete(key: string): Promise<Result<void, StorageError>> {
    if (!this.entries.delete(key)) return Promise.resolve(err({ kind: "NotFound", key }));
    return Promise.resolve(ok(undefined));
  }

  keys(prefix: string): Promise<Result<readonly string[], StorageError>> {
    const matching = [...this.entries.keys()].filter((k) => k.startsWith(prefix));
    return Promise.resolve(ok(matching));
  }
}
