/**
 * Browser ItemFilterStore backed by localStorage — the exact sibling of
 * {@link LocalStorageSettingsStore}: JSON on save, re-validated through the
 * domain factory on load so corrupt/older data degrades to a typed error
 * rather than a crash. Untested composition glue (behaviour is the domain
 * factory + the platform API, both already covered).
 */

import { err, isErr, ok, type Result } from "../../domain/Result";
import { defaultFilterRules, parseFilterRules, type FilterRule } from "../../domain/inventory/ItemFilter";
import type { ItemFilterStore, ItemFilterStoreError } from "../../application/ports/ItemFilterStore";

const STORAGE_KEY = "laas.game.itemFilterRules.v1";

export class LocalStorageItemFilterStore implements ItemFilterStore {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  load(): Promise<Result<readonly FilterRule[], ItemFilterStoreError>> {
    let raw: string | null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch (e) {
      return Promise.resolve(err({ kind: "StorageUnavailable", detail: String(e) }));
    }
    if (raw === null) return Promise.resolve(ok(defaultFilterRules()));
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return Promise.resolve(err({ kind: "StorageUnavailable", detail: `corrupt filter rules: ${e}` }));
    }
    const validated = parseFilterRules(parsed);
    if (isErr(validated)) return Promise.resolve(validated);
    return Promise.resolve(ok(validated.value));
  }

  save(rules: readonly FilterRule[]): Promise<Result<void, ItemFilterStoreError>> {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch (e) {
      return Promise.resolve(err({ kind: "StorageUnavailable", detail: String(e) }));
    }
    return Promise.resolve(ok(undefined));
  }
}
