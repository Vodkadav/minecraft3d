/**
 * Honest in-memory AccountStore — mirrors the IndexedDB adapter's contract
 * (mirrors InMemoryKeyValueStore) so account-scoped persistence (the E4.4
 * bank) can be tested and used as the offline/loopback default in Node.
 */

import { err, ok, type Result } from "../../domain/Result";
import type { AccountStore } from "../../application/ports/AccountStore";
import type { StorageError } from "../../application/ports/StorageError";

export class InMemoryAccountStore implements AccountStore {
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
}
