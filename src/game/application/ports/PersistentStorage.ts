/**
 * Port over the browser's storage-persistence permission. Default (best-effort)
 * storage can be LRU-evicted under pressure; `navigator.storage.persist()`
 * exempts the origin (research §7). The app should ensure persistence at first
 * save so a world is not silently evicted.
 */

export interface PersistentStorage {
  /** Whether the origin's storage is already exempt from eviction. */
  isPersisted(): Promise<boolean>;
  /** Request persistence; resolves to whether it is now granted. */
  requestPersist(): Promise<boolean>;
}
