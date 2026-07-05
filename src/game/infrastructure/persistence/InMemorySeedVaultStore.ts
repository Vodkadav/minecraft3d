/**
 * Honest in-memory SeedVaultStore — delegates all rules to the pure domain
 * SeedVault operations, so it obeys exactly the contract a persistent adapter
 * must. Used by tests and as the offline/loopback vault.
 */

import { isErr, ok, type Result } from "../../domain/Result";
import {
  addSeed,
  emptyVault,
  listSeeds,
  removeSeed,
  renameSeed,
  type SeedEntry,
  type SeedVault,
} from "../../domain/seedvault/SeedVault";
import type {
  SeedVaultStore,
  SeedVaultStoreError,
} from "../../application/ports/SeedVaultStore";

export class InMemorySeedVaultStore implements SeedVaultStore {
  private vault: SeedVault = emptyVault();

  add(entry: SeedEntry): Promise<Result<void, SeedVaultStoreError>> {
    const next = addSeed(this.vault, entry);
    if (isErr(next)) return Promise.resolve(next);
    this.vault = next.value;
    return Promise.resolve(ok(undefined));
  }

  rename(id: string, name: string): Promise<Result<void, SeedVaultStoreError>> {
    const next = renameSeed(this.vault, id, name);
    if (isErr(next)) return Promise.resolve(next);
    this.vault = next.value;
    return Promise.resolve(ok(undefined));
  }

  remove(id: string): Promise<Result<void, SeedVaultStoreError>> {
    const next = removeSeed(this.vault, id);
    if (isErr(next)) return Promise.resolve(next);
    this.vault = next.value;
    return Promise.resolve(ok(undefined));
  }

  list(): Promise<Result<readonly SeedEntry[], SeedVaultStoreError>> {
    return Promise.resolve(ok(listSeeds(this.vault)));
  }
}
