/**
 * Honest in-memory ItemFilterStore — used by tests (and any offline/loopback
 * caller) instead of touching real browser storage. Starts from domain
 * defaults and clones on the way in/out so callers can't mutate stored state
 * through a shared reference. Sibling of {@link InMemorySettingsStore}.
 */

import { ok, type Result } from "../../domain/Result";
import { defaultFilterRules, type FilterRule } from "../../domain/inventory/ItemFilter";
import type { ItemFilterStore, ItemFilterStoreError } from "../../application/ports/ItemFilterStore";

export class InMemoryItemFilterStore implements ItemFilterStore {
  private current: readonly FilterRule[] = defaultFilterRules();

  load(): Promise<Result<readonly FilterRule[], ItemFilterStoreError>> {
    return Promise.resolve(ok([...this.current]));
  }

  save(rules: readonly FilterRule[]): Promise<Result<void, ItemFilterStoreError>> {
    this.current = [...rules];
    return Promise.resolve(ok(undefined));
  }
}
