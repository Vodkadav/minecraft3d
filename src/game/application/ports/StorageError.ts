/**
 * Shared failure shape for the low-level storage ports (BlobStore,
 * KeyValueStore). These are the raw I/O edges the OPFS / IndexedDB adapters
 * hit; the composed WorldSaveStore maps them onto its own SaveError.
 */

export type StorageError =
  | { readonly kind: "NotFound"; readonly key: string }
  | { readonly kind: "Unavailable"; readonly detail: string }
  | { readonly kind: "QuotaExceeded" };
