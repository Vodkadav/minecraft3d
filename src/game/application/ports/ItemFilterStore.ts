/**
 * Persistence port for the player's item-filter rule set (Workstream E4.2).
 * Mirrors {@link SettingsStore} exactly: `load` yields the domain default
 * rule set when nothing is stored yet, so a first-run has valid rules with
 * no special case.
 */

import type { Result } from "../../domain/Result";
import type { FilterRule, FilterRuleError } from "../../domain/inventory/ItemFilter";

export type ItemFilterStoreError =
  | FilterRuleError
  | { readonly kind: "StorageUnavailable"; readonly detail: string };

export interface ItemFilterStore {
  load(): Promise<Result<readonly FilterRule[], ItemFilterStoreError>>;
  save(rules: readonly FilterRule[]): Promise<Result<void, ItemFilterStoreError>>;
}
