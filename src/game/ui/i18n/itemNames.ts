/**
 * Localized item display names (Workstream 4, task 4.4). `ItemDefinition.displayName`
 * is English-only registry data; this looks up `item.<id>.name` in the active
 * locale first and falls back to the registry's name so an item added
 * without a translation never renders blank.
 */

import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import { isOk } from "../../domain/Result";
import type { Localizer } from "../../application/i18n/Localizer";

export function itemDisplayName(loc: Localizer, registry: ItemRegistry, itemId: string): string {
  const key = `item.${itemId}.name`;
  const localized = loc.t(key);
  if (localized !== key) return localized;
  const def = registry.get(itemId);
  return isOk(def) ? def.value.displayName : itemId;
}
