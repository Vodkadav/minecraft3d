/**
 * Composition root for the themed play-HUD (Workstream 3 + 4): mounts a live
 * player Inventory + Hotbar bound to it, a Toast host, a Crosshair, and the
 * togglable Inventory/Crafting overlay (`I` to open), and wires loot pickups
 * (`SpawnFieldDeps.onLoot`) through to both the hotbar (item added) and a
 * toast ("Picked up X x3"). One instance per scene.
 *
 * Digit-key 1-9 hotbar selection is opt-out (`enableHotbarDigitKeys: false`)
 * for scenes that already bind 1-9 to something else — the terrain scene's
 * camera bookmarks (`Bookmarks.ts`) own those keys, so wiring both would
 * silently break the existing dev/tooling shortcut. Wheel-scroll and click
 * selection still work there.
 *
 * Workstream 5.2: `H` eats the food item in the selected hotbar slot (a
 * no-op on an empty/non-food slot) — consumes one, restores via `onEat`
 * (the composition root owns hunger/health state, this is a thin hook).
 * Workstream 5.3: `applyDeathPenalty` drops slots per the configured rule.
 */

import { isOk } from "../game/domain/Result";
import { STARTER_RECIPES } from "../game/domain/crafting/starterRecipes";
import type { Recipe } from "../game/domain/crafting/Crafting";
import { Inventory, type ItemStack } from "../game/domain/inventory/Inventory";
import type { ItemRegistry } from "../game/domain/items/ItemRegistry";
import type { FoodMetadata } from "../game/domain/items/ItemDefinition";
import type { DeathPenalty } from "../game/domain/survival/Respawn";
import { dropOnDeath } from "../game/domain/survival/Respawn";
import { HOTBAR_SIZE } from "../game/domain/ui/HotbarSelection";
import type { CrosshairState } from "../game/domain/ui/CrosshairState";
import type { AudioPort } from "../game/application/ports/AudioPort";
import type { FeelPort } from "../game/application/ports/FeelPort";
import type { Localizer } from "../game/application/i18n/Localizer";
import { Button } from "../game/ui/components/Button";
import { Crosshair, type CrosshairHandle } from "../game/ui/components/Crosshair";
import { Hotbar } from "../game/ui/components/Hotbar";
import { createToastHost } from "../game/ui/components/Toast";
import { mountInventoryScreen } from "../game/ui/InventoryScreen";

const INVENTORY_CAPACITY = 27;
const LOOT_TOAST_TTL_MS = 3500;
/** No progression/unlock system yet (Workstream 6) — every starter recipe is
 *  available; the crafting screen's lock UI is exercised by its own tests. */
const DEFAULT_UNLOCKED_TIER = 1;

export interface GameHudOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  readonly enableHotbarDigitKeys?: boolean;
  readonly doc?: Document;
  /** Reuse a crosshair the scene already owns (e.g. one mounted alongside
   *  the dig tool regardless of whether spawns are on) instead of mounting
   *  a second one. Owned/disposed by whoever created it, not by this HUD. */
  readonly crosshair?: CrosshairHandle;
  readonly audio?: AudioPort;
  readonly feel?: FeelPort;
  readonly recipes?: readonly Recipe[];
  readonly unlockedTier?: number;
  /** Pauses/resumes camera-look input while the inventory overlay is open —
   *  wire to `ctx.hooks.flyCamEnabled` in the scene composition root. */
  setInputEnabled?(enabled: boolean): void;
  /** Fired after a successful eat (Workstream 5.2) — the composition root
   *  applies hunger/health restore to its own survival/vitals state. */
  onEat?(food: FoodMetadata): void;
}

export interface GameHudHandle {
  addLoot(stacks: readonly ItemStack[]): void;
  setCrosshairState(state: CrosshairState): void;
  /** Eats the food item in the selected hotbar slot, if any. Returns false
   *  (no-op) for an empty slot or a non-food item. */
  eatSelected(): boolean;
  /** Drops inventory contents per the death-penalty rule (Workstream 5.3);
   *  a no-op for "keep-inventory". */
  applyDeathPenalty(penalty: DeathPenalty): void;
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

  const inventoryScreen = mountInventoryScreen({
    loc,
    registry,
    recipes: opts.recipes ?? STARTER_RECIPES,
    unlockedTier: opts.unlockedTier ?? DEFAULT_UNLOCKED_TIER,
    ...(opts.audio ? { audio: opts.audio } : {}),
    ...(opts.setInputEnabled ? { setInputEnabled: opts.setInputEnabled } : {}),
    doc,
    onInventoryChange: (next) => {
      inventory = next;
      hotbar.render(inventory);
    },
  });

  // Mouse-only access to the inventory/crafting overlay (Pillar 4 gate: no
  // keyboard memorization required) — `I` is a shortcut, this button is the
  // discoverable entry point.
  const inventoryButton = Button({
    label: loc.t("inventory.tab.inventory"),
    ariaLabel: loc.t("inventory.title"),
    variant: "quiet",
    onClick: () => inventoryScreen.toggle(),
  });
  inventoryButton.classList.add("lw-inv-open-button");
  doc.body.appendChild(inventoryButton);

  function eatSelected(): boolean {
    const slot = inventory.slots[hotbar.selected];
    if (!slot) return false;
    const def = registry.get(slot.itemId);
    if (!isOk(def) || !def.value.food) return false;
    const removed = inventory.remove(slot.itemId, 1);
    if (!isOk(removed)) return false;
    inventory = removed.value;
    hotbar.render(inventory);
    inventoryScreen.setInventory(inventory);
    opts.audio?.play("eat");
    opts.feel?.trigger("eat");
    toasts.push("hud.toast.ate", { name: def.value.displayName }, LOOT_TOAST_TTL_MS);
    opts.onEat?.(def.value.food);
    return true;
  }

  function isTextInputFocused(): boolean {
    const el = doc.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
  }
  function onEatKeyDown(e: KeyboardEvent): void {
    if (e.code === "KeyH" && !isTextInputFocused()) eatSelected();
  }
  (doc.defaultView ?? window).addEventListener("keydown", onEatKeyDown);

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
      inventoryScreen.setInventory(inventory);
    },
    setCrosshairState(state: CrosshairState): void {
      crosshair.setState(state);
    },
    eatSelected,
    applyDeathPenalty(penalty: DeathPenalty): void {
      if (penalty === "keep-inventory") return;
      const nextSlots = dropOnDeath(inventory.slots, HOTBAR_SIZE, penalty);
      const rebuilt = Inventory.fromSlots(registry, nextSlots);
      if (!isOk(rebuilt)) return;
      inventory = rebuilt.value;
      hotbar.render(inventory);
      inventoryScreen.setInventory(inventory);
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onEatKeyDown);
      hotbar.dispose();
      toasts.dispose();
      inventoryScreen.dispose();
      inventoryButton.remove();
      if (ownsCrosshair) crosshair.dispose();
    },
  };
}
