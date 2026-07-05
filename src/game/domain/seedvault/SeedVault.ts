/**
 * A local, named collection of world seeds. Pure model + operations — this
 * feeds the M4 lobby flow where a host picks a saved seed. No I/O: persistence
 * is a port (application/ports/SeedVaultStore).
 *
 * Every mutating op returns a new vault (non-mutating) and validates its inputs,
 * surfacing expected failures as Result values (err-explicit-result-handling).
 */

import { err, isErr, ok, type Result } from "../Result";

export const MAX_SEED_NAME_LENGTH = 60;

export interface SeedEntry {
  readonly id: string;
  readonly seed: number;
  readonly name: string;
  readonly createdAt: number;
}

/** Opaque, ordered collection. Kept as a readonly array for structural clarity. */
export type SeedVault = readonly SeedEntry[];

export type SeedNameError = {
  readonly kind: "InvalidName";
  readonly reason: "empty" | "tooLong";
};

export type SeedVaultError =
  | SeedNameError
  | { readonly kind: "DuplicateId"; readonly id: string }
  | { readonly kind: "NotFound"; readonly id: string };

export function emptyVault(): SeedVault {
  return [];
}

/** Trim, then enforce non-empty + length bound. Returns the normalized name. */
export function validateSeedName(name: string): Result<string, SeedNameError> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return err({ kind: "InvalidName", reason: "empty" });
  if (trimmed.length > MAX_SEED_NAME_LENGTH) {
    return err({ kind: "InvalidName", reason: "tooLong" });
  }
  return ok(trimmed);
}

export function addSeed(
  vault: SeedVault,
  entry: SeedEntry,
): Result<SeedVault, SeedVaultError> {
  const name = validateSeedName(entry.name);
  if (isErr(name)) return name;
  if (vault.some((e) => e.id === entry.id)) {
    return err({ kind: "DuplicateId", id: entry.id });
  }
  return ok([...vault, { ...entry, name: name.value }]);
}

export function renameSeed(
  vault: SeedVault,
  id: string,
  name: string,
): Result<SeedVault, SeedVaultError> {
  if (!vault.some((e) => e.id === id)) return err({ kind: "NotFound", id });
  const validated = validateSeedName(name);
  if (isErr(validated)) return validated;
  return ok(vault.map((e) => (e.id === id ? { ...e, name: validated.value } : e)));
}

export function removeSeed(
  vault: SeedVault,
  id: string,
): Result<SeedVault, SeedVaultError> {
  if (!vault.some((e) => e.id === id)) return err({ kind: "NotFound", id });
  return ok(vault.filter((e) => e.id !== id));
}

/** Stable display order: oldest first, ties broken by id for determinism. */
export function listSeeds(vault: SeedVault): readonly SeedEntry[] {
  return [...vault].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
