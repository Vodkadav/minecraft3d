/**
 * IndexedDB-backed KeyValueStore — the real structured-metadata index in the
 * browser. Thin glue over the tested core (PersistentWorldSaveStore holds all
 * layout logic); this only bridges the KeyValueStore port onto IndexedDB, so it
 * carries no unit-testable logic (IndexedDB is browser-only, absent from the
 * Node/Vitest env — TDD carve-out for trivial I/O glue).
 */

import { err, ok, type Result } from "../../domain/Result";
import type { KeyValueStore } from "../../application/ports/KeyValueStore";
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

export class IndexedDbKeyValueStore implements KeyValueStore {
  constructor(
    private readonly dbName = "laas-world-meta",
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

  async delete(key: string): Promise<Result<void, StorageError>> {
    try {
      const db = await this.open();
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const existing = await request<unknown>(store.get(key));
      if (existing === undefined) {
        db.close();
        return err({ kind: "NotFound", key });
      }
      await request(store.delete(key));
      db.close();
      return ok(undefined);
    } catch (e) {
      return err(mapError(e));
    }
  }

  async keys(prefix: string): Promise<Result<readonly string[], StorageError>> {
    try {
      const db = await this.open();
      const tx = db.transaction(this.storeName, "readonly");
      const allKeys = await request<IDBValidKey[]>(
        tx.objectStore(this.storeName).getAllKeys(),
      );
      db.close();
      const matching = allKeys
        .map((k) => String(k))
        .filter((k) => k.startsWith(prefix));
      return ok(matching);
    } catch (e) {
      return err(mapError(e));
    }
  }
}
