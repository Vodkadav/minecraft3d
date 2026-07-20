/**
 * Autoloot decision (E4.3) — given nearby ground items, the player's
 * inventory, and an autoloot radius/filter, decide which stacks to pull.
 * Pure: never mutates its inputs, never conjures or discards an item.
 *
 * Robust inventory-full rule: reuses `Inventory.add`'s `InventoryFull` error
 * (which already reports how much DIDN'T fit as `remaining`) to compute the
 * exact amount that DOES fit, so a stack that doesn't fully fit still tops up
 * the inventory with a partial pickup and leaves the rest on the ground as a
 * reduced-count `GroundItem` — never a silent full-stack loss.
 */

import { isOk } from "../Result";
import type { Inventory } from "../inventory/Inventory";
import type { GroundItem } from "./GroundItem";

export interface AutolootSettings {
  readonly enabled: boolean;
  /** Metres; items further than this are left alone regardless of fit. */
  readonly radiusM: number;
}

export interface AutolootPickup {
  readonly item: GroundItem;
  /** Amount actually pulled — may be less than `item.count` on a partial fit. */
  readonly count: number;
}

export interface AutolootDecision {
  readonly inventory: Inventory;
  readonly pickedUp: readonly AutolootPickup[];
  /** Items left on the ground: out of range, filtered out, or (for a partial
   *  pickup) the reduced-count remainder that didn't fit. */
  readonly leftBehind: readonly GroundItem[];
  /** True iff at least one in-range, filter-passing item didn't fully fit —
   *  distinct from simply being out of range/filtered — drives a "bag full" toast. */
  readonly bagFull: boolean;
}

export interface DecideAutolootArgs {
  readonly items: readonly GroundItem[];
  readonly playerPosition: readonly [number, number, number];
  readonly inventory: Inventory;
  readonly settings: AutolootSettings;
  /** Optional loot filter (E4.2) — items it rejects are left on the ground
   *  untouched, same as being out of range. */
  readonly filter?: (item: GroundItem) => boolean;
}

function distanceSq(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

export function decideAutoloot(args: DecideAutolootArgs): AutolootDecision {
  const { items, playerPosition, settings, filter } = args;
  let inventory = args.inventory;

  if (!settings.enabled) {
    return { inventory, pickedUp: [], leftBehind: [...items], bagFull: false };
  }

  const pickedUp: AutolootPickup[] = [];
  const leftBehind: GroundItem[] = [];
  let bagFull = false;
  const radiusSq = settings.radiusM * settings.radiusM;

  for (const item of items) {
    if (distanceSq(item.position, playerPosition) > radiusSq) {
      leftBehind.push(item);
      continue;
    }
    if (filter && !filter(item)) {
      leftBehind.push(item);
      continue;
    }

    const attempt = inventory.add(item.itemId, item.count);
    if (isOk(attempt)) {
      inventory = attempt.value;
      pickedUp.push({ item, count: item.count });
      continue;
    }

    // Anything other than InventoryFull (e.g. an unregistered item id) is not
    // a fit problem — leave the stack behind without flagging "bag full".
    if (attempt.error.kind !== "InventoryFull") {
      leftBehind.push(item);
      continue;
    }
    // InventoryFull: `remaining` is exactly what did NOT fit, so
    // `item.count - remaining` is guaranteed to fit in one more `add`.
    const fit = item.count - attempt.error.remaining;
    if (fit > 0) {
      const partial = inventory.add(item.itemId, fit);
      if (isOk(partial)) {
        inventory = partial.value;
        pickedUp.push({ item, count: fit });
        leftBehind.push({ ...item, count: item.count - fit });
        bagFull = true;
        continue;
      }
    }
    leftBehind.push(item);
    bagFull = true;
  }

  return { inventory, pickedUp, leftBehind, bagFull };
}
