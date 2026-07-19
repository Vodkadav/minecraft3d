/**
 * Persistence port for account-scoped state — data that lives ABOVE any one
 * world (Phase E4.4's account bank is the first consumer). Distinct from
 * `WorldSaveStore`, which is keyed per world: an `AccountStore` has exactly
 * one record per key, reachable identically no matter which world/character
 * is currently loaded, so depositing in world A and withdrawing in world B
 * round-trips through the same underlying value.
 *
 * Expected failures are Result values, not thrown exceptions
 * (err-explicit-result-handling); `NotFound` is the only branch a caller must
 * routinely handle (e.g. "no bank saved yet" -> start from an empty one).
 */

import type { Result } from "../../domain/Result";
import type { StorageError } from "./StorageError";

export interface AccountStore {
  put(key: string, value: string): Promise<Result<void, StorageError>>;
  get(key: string): Promise<Result<string, StorageError>>;
}
