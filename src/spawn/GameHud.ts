/**
 * Composition root for the themed play-HUD (Workstream 3): mounts a live
 * player Inventory + Hotbar bound to it, a Toast host, and a Crosshair, and
 * wires loot pickups (`SpawnFieldDeps.onLoot`) through to both the hotbar
 * (item added) and a toast ("Picked up X x3"). One instance per scene.
 *
 * Digit-key 1-9 hotbar selection is opt-out (`enableHotbarDigitKeys: false`)
 * for scenes that already bind 1-9 to something else — the terrain scene's
 * camera bookmarks (`Bookmarks.ts`) own those keys, so wiring both would
 * silently break the existing dev/tooling shortcut. Wheel-scroll and click
 * selection still work there.
 */

import { isOk } from "../game/domain/Result";
import { Inventory, type ItemStack } from "../game/domain/inventory/Inventory";
import type { ItemRegistry } from "../game/domain/items/ItemRegistry";
import type { CrosshairState } from "../game/domain/ui/CrosshairState";
import type { Localizer } from "../game/application/i18n/Localizer";
import { Crosshair, type CrosshairHandle } from "../game/ui/components/Crosshair";
import { Hotbar } from "../game/ui/components/Hotbar";
import { createToastHost } from "../game/ui/components/Toast";

const INVENTORY_CAPACITY = 27;
const LOOT_TOAST_TTL_MS = 3500;

export interface GameHudOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  readonly enableHotbarDigitKeys?: boolean;
  readonly doc?: Document;
  /** Reuse a crosshair the scene already owns (e.g. one mounted alongside
   *  the dig tool regardless of whether spawns are on) instead of mounting
   *  a second one. Owned/disposed by whoever created it, not by this HUD. */
  readonly crosshair?: CrosshairHandle;
}

export interface GameHudHandle {
  addLoot(stacks: readonly ItemStack[]): void;
  setCrosshairState(state: CrosshairState): void;
  readonly inventory: Inventory;
  dispose(): void;
}

export function mountGameHud(opts: GameHudOptions): GameHudHandle {
  const doc = opts.doc ?? document;
  const { loc, registry } = opts;

  let inventory = Inventory.empty(registry, INVENTORY_CAPACITY);

  const hotbar = Hotbar({
    registry,
    ariaLabel: loc.t("hud.hotbar"),
    slotAriaLabel: (i) => loc.t("hud.hotbar.slot", { n: i + 1 }),
    emptySlotLabel: loc.t("hud.hotbar.empty"),
    enableDigitKeys: opts.enableHotbarDigitKeys ?? true,
  });
  doc.body.appendChild(hotbar.el);
  hotbar.render(inventory);

  const toasts = createToastHost(loc, { ariaLabel: loc.t("hud.notifications") });
  doc.body.appendChild(toasts.el);

  const crosshair = opts.crosshair ?? Crosshair(doc);
  const ownsCrosshair = opts.crosshair === undefined;

  return {
    get inventory() {
      return inventory;
    },
    addLoot(stacks: readonly ItemStack[]): void {
      for (const stack of stacks) {
        const added = inventory.add(stack.itemId, stack.count);
        if (!isOk(added)) continue; // full inventory: loot silently caps (no crash)
        inventory = added.value;
        const def = registry.get(stack.itemId);
        const name = isOk(def) ? def.value.displayName : stack.itemId;
        toasts.push("hud.toast.loot", { name, count: stack.count }, LOOT_TOAST_TTL_MS);
      }
      hotbar.render(inventory);
    },
    setCrosshairState(state: CrosshairState): void {
      crosshair.setState(state);
    },
    dispose(): void {
      hotbar.dispose();
      toasts.dispose();
      if (ownsCrosshair) crosshair.dispose();
    },
  };
}
