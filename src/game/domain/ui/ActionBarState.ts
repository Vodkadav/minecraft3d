/**
 * Pure action-bar state (E8.7 HUD cohesion) — a togglable, hotbar-adjacent bar
 * of ability/consumable slots. Two concerns kept separate:
 *  - visibility: a plain toggle (`ActionBarVisibility`), the same opt-in-off
 *    posture as `PartyPanel`'s "P" / `CombatMeterPanel`'s "L" ("N" toggles it
 *    — see `ui/components/ActionBar.ts`).
 *  - slot content: pure builders that turn EXISTING domain data (the E7.3
 *    `AbilityRegistry` spell catalogue, the player's `Inventory`) into
 *    renderable slots — no new ability/consumable system invented
 *    (reuse-first, per docs/UX_PLAN.md).
 *
 * Standing deferral (recorded in docs/UX_PLAN.md, mirrors its existing
 * deferred-status-effect note on Frost Puff/Vine Snare): no per-ability
 * cast-cooldown timestamp is tracked client-side yet — E7.3 built
 * host-authoritative cast resolution only (`HostSession.handleCastSpell`),
 * `CastBar.ts` shows the generic focus resource, not per-spell cooldowns.
 * `buildAbilitySlots` accepts an optional `readyFractions` map so a future
 * composition root can feed real cooldown state without this module
 * changing shape; omitted ids default to ready (1).
 */

import type { AbilitySpec } from "../combat/AbilityRegistry";
import type { Inventory } from "../inventory/Inventory";
import type { ItemRegistry } from "../items/ItemRegistry";
import { isOk } from "../Result";

/** Same cap as `HotbarSelection.HOTBAR_SIZE` — a second row the same width
 *  as the hotbar it sits beside. */
export const ACTION_BAR_SIZE = 9;

export type ActionBarSlotKind = "ability" | "consumable";

export interface ActionBarSlot {
  readonly id: string;
  readonly kind: ActionBarSlotKind;
  readonly displayName: string;
  /** 0..1; 1 = fully ready/available. Abilities: off-cooldown fraction (0 =
   *  just cast, 1 = ready). Consumables: always 1 — availability there is
   *  `count > 0`, not a cooldown concept. */
  readonly readyFraction: number;
  /** Consumable stack count; undefined for abilities. */
  readonly count?: number;
  /** Consumable item id (for icon/rarity/tooltip reuse); undefined for
   *  abilities, which have no item-registry entry. */
  readonly itemId?: string;
}

export interface ActionBarVisibility {
  readonly visible: boolean;
}

/** Opt-in, OFF by default — matches every other togglable HUD panel. */
export function initialActionBarVisibility(): ActionBarVisibility {
  return { visible: false };
}

export function toggleActionBarVisibility(state: ActionBarVisibility): ActionBarVisibility {
  return { visible: !state.visible };
}

function clampFraction(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

/** Builds ability slots from the E7.3 ability catalogue (`STARTER_ABILITIES`/
 *  `AbilityRegistry.all()`), capped at `ACTION_BAR_SIZE`. `readyFractions`
 *  (ability id -> 0..1) seeds cooldown state when a caller tracks it;
 *  missing ids default to ready — see the module doc comment's deferral. */
export function buildAbilitySlots(
  specs: readonly AbilitySpec[],
  readyFractions: ReadonlyMap<string, number> = new Map(),
): readonly ActionBarSlot[] {
  return specs.slice(0, ACTION_BAR_SIZE).map((spec) => ({
    id: spec.id,
    kind: "ability",
    displayName: spec.displayName,
    readyFraction: clampFraction(readyFractions.get(spec.id) ?? 1),
  }));
}

/** Builds consumable slots from the player's inventory: every distinct
 *  food-tagged item currently held, counts summed across stacks, first-seen
 *  slot order, capped at `max`. Reuses the exact `food` metadata the
 *  hotbar's `H`-to-eat flow (`GameHud.eatSelected`) already keys off — no
 *  new consumable model. */
export function buildConsumableSlots(
  inventory: Inventory,
  registry: ItemRegistry,
  max: number = ACTION_BAR_SIZE,
): readonly ActionBarSlot[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const slot of inventory.slots) {
    if (!slot) continue;
    const def = registry.get(slot.itemId);
    if (!isOk(def) || !def.value.food) continue;
    if (!counts.has(slot.itemId)) {
      order.push(slot.itemId);
      names.set(slot.itemId, def.value.displayName);
    }
    counts.set(slot.itemId, (counts.get(slot.itemId) ?? 0) + slot.count);
  }
  return order.slice(0, max).map((itemId) => ({
    id: itemId,
    kind: "consumable",
    displayName: names.get(itemId)!,
    readyFraction: 1,
    count: counts.get(itemId),
    itemId,
  }));
}

/** Digit key 1-9 -> slot index 0-8. Deliberately NOT shared with
 *  `HotbarSelection`'s digit mapping: the hotbar tracks a persistent
 *  "selected slot", while an action-bar keypress is a momentary activation
 *  (press = fire) with no selection state of its own — a different enough
 *  shape that reusing the stateful hotbar module would be the wrong fit. */
export function actionBarIndexForDigit(digit: number): number | null {
  if (!Number.isInteger(digit) || digit < 1 || digit > ACTION_BAR_SIZE) return null;
  return digit - 1;
}
