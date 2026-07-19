/**
 * IndexedDB-backed AccountStore — the real account-scoped store in the
 * browser. Deliberately a SEPARATE database (`laas-account`, not
 * `laas-world-meta`) from `IndexedDbKeyValueStore`'s per-world metadata: an
 * account key is reachable identically no matter which world is currently
 * loaded, which is what makes the bank persist across worlds/characters.
 * Thin glue over IndexedDB (browser-only, absent from the Node/Vitest env —
 * TDD carve-out for trivial I/O glue, same as `IndexedDbKeyValueStore`).
 */

import { err, ok, type Result } from "../../domain/Result";
import type { AccountStore } from "../../application/ports/AccountStore";
import type { StorageError } from "../../application/ports/StorageError";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function mapError(e: unknown): StorageError {
  if (e instanceof DOMException) {
    if (e.name === "QuotaExceededError") return { kind: "QuotaExceeded" };
    return { kind: "Unavailable", detail: e.name };
  }
  return { kind: "Unavailable", detail: String(e) };
}

export class IndexedDbAccountStore implements AccountStore {
  constructor(
    private readonly dbName = "laas-account",
    private readonly storeName = "kv",
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(this.storeName)) {
          req.result.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(key: string, value: string): Promise<Result<void, StorageError>> {
    try {
      const db = await this.open();
      const tx = db.transaction(this.storeName, "readwrite");
      await request(tx.objectStore(this.storeName).put(value, key));
      db.close();
      return ok(undefined);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async get(key: string): Promise<Result<string, StorageError>> {
    try {
      const db = await this.open();
      const tx = db.transaction(this.storeName, "readonly");
      const value = await request<unknown>(tx.objectStore(this.storeName).get(key));
      db.close();
      if (value === undefined) return err({ kind: "NotFound", key });
      return ok(value as string);
    } catch (e) {
      return err(mapError(e));
    }
  }
}
