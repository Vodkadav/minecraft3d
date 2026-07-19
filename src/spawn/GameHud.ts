/**
 * Composition root for the themed play-HUD (Workstream 3 + 4 + 6): mounts a
 * live player Inventory + Hotbar bound to it, a Toast host, a Crosshair, the
 * togglable Inventory/Crafting/Achievements overlay (`I` to open), the
 * objective tracker panel, and wires loot pickups (`SpawnFieldDeps.onLoot`)
 * through to both the hotbar (item added) and a toast ("Picked up X x3").
 * One instance per scene.
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
 *
 * Phase E4.4: also mounts the account `BankScreen` (`K` toggles it, mirroring
 * `InventoryScreen`'s `I`), a mouse-accessible open button beside the
 * inventory one. Bank state lives in-memory here exactly like `inventory`
 * did before S7b's persistence wiring landed — `initialBank`/`onBankChange`
 * are the seam a future composition-root change threads `BankPersistence`
 * through (deferred this slice, same precedent as E1.5's un-wired
 * `CharacterScreen`). SINGLE-PLAYER/HOST-LOCAL ONLY per the E0.4 security
 * caveat — no networked deposit/withdraw path exists yet.
 *
 * Workstream 6: this HUD owns the session's `ProgressionState`/`KeyhintState`
 * the same way it owns `inventory` — in-memory only; `ProgressionPersistence`
 * is a tested, not-yet-wired seam (mirrors S4's un-wired `InventoryPersistence`).
 * `recordProgress(event)` is the one entry point every game-event call site
 * threads an event through (the same `onX` callback pattern already used for
 * `onEat`/`onLoot`/`onAttack` at the TerrainScene/SpawnFieldView/DigTool call
 * sites) — it settles objectives/achievements, toasts anything new, updates
 * the tracker, and live-updates the crafting screen's recipe-tier gate.
 */

import { isOk } from "../game/domain/Result";
import { ACHIEVEMENTS } from "../game/domain/progression/Achievements";
import {
  emptyKeyhintState,
  markKeyhintShown,
  shouldShowKeyhint,
  type KeyhintState,
} from "../game/domain/progression/Keyhints";
import { TUTORIAL_OBJECTIVE_IDS, TUTORIAL_OBJECTIVES } from "../game/domain/progression/Objectives";
import {
  currentObjective,
  emptyProgression,
  recordProgressionEvent,
  skipTutorial,
  unlockedTierFor,
  type ProgressionState,
} from "../game/domain/progression/ProgressionState";
import type { ProgressionEventId } from "../game/domain/progression/ProgressionEvents";
import { STARTER_RECIPES } from "../game/domain/crafting/starterRecipes";
import type { Recipe } from "../game/domain/crafting/Crafting";
import { Inventory, type ItemStack } from "../game/domain/inventory/Inventory";
import type { ItemRegistry } from "../game/domain/items/ItemRegistry";
import type { FoodMetadata } from "../game/domain/items/ItemDefinition";
import type { DeathPenalty } from "../game/domain/survival/Respawn";
import { dropOnDeath } from "../game/domain/survival/Respawn";
import { HOTBAR_SIZE } from "../game/domain/ui/HotbarSelection";
import type { CrosshairState } from "../game/domain/ui/CrosshairState";
import { Bank, type BankOptions } from "../game/domain/storage/Bank";
import type { AudioPort } from "../game/application/ports/AudioPort";
import type { FeelPort } from "../game/application/ports/FeelPort";
import type { Localizer } from "../game/application/i18n/Localizer";
import { Button } from "../game/ui/components/Button";
import { Crosshair, type CrosshairHandle } from "../game/ui/components/Crosshair";
import { Hotbar } from "../game/ui/components/Hotbar";
import { Keyhint } from "../game/ui/components/Keyhint";
import { ObjectiveTracker } from "../game/ui/components/ObjectiveTracker";
import { createToastHost } from "../game/ui/components/Toast";
import { mountInventoryScreen } from "../game/ui/InventoryScreen";
import { mountBankScreen } from "../game/ui/BankScreen";

const INVENTORY_CAPACITY = 27;
const DEFAULT_BANK_OPTIONS: BankOptions = { sharedCapacity: 45, tabCapacity: 27 };
const DEFAULT_CHARACTER_ID = "player";
const LOOT_TOAST_TTL_MS = 3500;
const OBJECTIVE_TOAST_TTL_MS = 4500;
const KEYHINT_TTL_MS = 4000;
const TUTORIAL_EXCLUDE = new Set<string>(TUTORIAL_OBJECTIVE_IDS);

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
  /** Pauses/resumes camera-look input while the inventory overlay is open —
   *  wire to `ctx.hooks.flyCamEnabled` in the scene composition root. */
  setInputEnabled?(enabled: boolean): void;
  /** Fired after a successful eat (Workstream 5.2) — the composition root
   *  applies hunger/health restore to its own survival/vitals state. */
  onEat?(food: FoodMetadata): void;
  /** S7b: seeds the session from a prior save (`GameStatePersistence.load`)
   *  instead of the empty defaults — undefined on a brand-new owner/world. */
  readonly initialInventory?: Inventory;
  readonly initialProgression?: ProgressionState;
  readonly initialKeyhints?: KeyhintState;
  /** Phase E4.4: seeds the bank overlay from a prior save (`BankPersistence`)
   *  once the composition root wires it — undefined starts an empty bank. */
  readonly initialBank?: Bank;
  readonly bankOptions?: BankOptions;
  /** Whose private bank tab this session's "Character" tab shows; defaults
   *  to the single-player owner id used elsewhere in this HUD. */
  readonly characterId?: string;
  /** Fired after any successful bank deposit/withdraw/move — the composition
   *  root persists the resulting bank via `BankPersistence` (not yet wired). */
  onBankChange?(next: Bank): void;
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
  /** Feeds one progression event (Workstream 6) — settles objectives,
   *  achievements, and the crafting-tier gate; toasts anything new. */
  recordProgress(event: ProgressionEventId): void;
  /** Shows the "[T] Feed" keyhint once, the first time a tamable creature is
   *  in reach (Workstream 6.5) — a no-op every subsequent call. Call this
   *  from the per-frame interact-target poll the scene already runs. */
  maybeShowTameHint(): void;
  /** Shows the "[E] Open/Use" keyhint once, the first time a functional
   *  placeable is in reach (S7b) — same shown-once contract as tame/eat. */
  maybeShowInteractHint(): void;
  /** Pushes a localized toast (S7b: bed spawn-set, etc.) — the one seam
   *  outside call sites need into the HUD's own toast host. */
  toast(messageKey: string, params?: Readonly<Record<string, string | number>>): void;
  /** Replaces the whole inventory silently (no loot toast) — S7b's chest
   *  deposit/withdraw and cook/harvest grants go through this, not addLoot,
   *  when the composition root already owns the resulting Inventory. */
  setInventory(next: Inventory): void;
  /** The item id in the currently-selected hotbar slot, or null if empty
   *  (S7b: farming plant reads the selected seed from here). */
  selectedHotbarItemId(): string | null;
  readonly inventory: Inventory;
  readonly progression: ProgressionState;
  readonly keyhints: KeyhintState;
  readonly bank: Bank;
  dispose(): void;
}

export function mountGameHud(opts: GameHudOptions): GameHudHandle {
  const doc = opts.doc ?? document;
  const { loc, registry } = opts;

  let inventory = opts.initialInventory ?? Inventory.empty(registry, INVENTORY_CAPACITY);
  let progression = opts.initialProgression ?? emptyProgression();
  let keyhints = opts.initialKeyhints ?? emptyKeyhintState();
  let bank = opts.initialBank ?? Bank.empty(registry, opts.bankOptions ?? DEFAULT_BANK_OPTIONS);

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

  const tracker = ObjectiveTracker(loc, {
    doc,
    onSkipTutorial: () => {
      progression = skipTutorial(progression);
      renderTracker();
    },
  });

  const inventoryScreen = mountInventoryScreen({
    loc,
    registry,
    recipes: opts.recipes ?? STARTER_RECIPES,
    unlockedTier: unlockedTierFor(progression.completedObjectives, TUTORIAL_OBJECTIVES),
    achievements: ACHIEVEMENTS,
    ...(opts.audio ? { audio: opts.audio } : {}),
    ...(opts.setInputEnabled ? { setInputEnabled: opts.setInputEnabled } : {}),
    doc,
    onInventoryChange: (next) => {
      inventory = next;
      hotbar.render(inventory);
    },
    onCraft: () => recordProgress("craft"),
  });

  // Mouse-only access to the inventory/crafting/achievements overlay (Pillar
  // 4 gate: no keyboard memorization required) — `I` is a shortcut, this
  // button is the discoverable entry point.
  const inventoryButton = Button({
    label: loc.t("inventory.tab.inventory"),
    ariaLabel: loc.t("inventory.title"),
    variant: "quiet",
    onClick: () => inventoryScreen.toggle(),
  });
  inventoryButton.classList.add("lw-inv-open-button");
  doc.body.appendChild(inventoryButton);

  const bankScreen = mountBankScreen({
    loc,
    registry,
    characterId: opts.characterId ?? DEFAULT_CHARACTER_ID,
    ...(opts.setInputEnabled ? { setInputEnabled: opts.setInputEnabled } : {}),
    doc,
    onChange: (nextPlayer, nextBank) => {
      inventory = nextPlayer;
      bank = nextBank;
      hotbar.render(inventory);
      inventoryScreen.setInventory(inventory);
      opts.onBankChange?.(bank);
    },
  });

  // Mouse-only access to the bank overlay, mirroring the inventory button —
  // `K` is the keyboard shortcut (BankScreen owns that binding internally).
  const bankButton = Button({
    label: loc.t("bank.title"),
    ariaLabel: loc.t("bank.open.aria"),
    variant: "quiet",
    onClick: () => bankScreen.toggle(),
  });
  bankButton.classList.add("lw-inv-open-button", "lw-bank-open-button");
  doc.body.appendChild(bankButton);
  bankScreen.setPlayerInventory(inventory);
  bankScreen.setBank(bank);

  function renderTracker(): void {
    const excluded = progression.tutorialSkipped ? TUTORIAL_EXCLUDE : undefined;
    const objective = currentObjective(progression, TUTORIAL_OBJECTIVES, excluded);
    tracker.render(objective, progression.counts);
  }
  renderTracker();

  function recordProgress(event: ProgressionEventId): void {
    const r = recordProgressionEvent(progression, event, TUTORIAL_OBJECTIVES, ACHIEVEMENTS);
    progression = r.state;
    for (const objective of r.newlyCompletedObjectives) {
      toasts.push(
        "objective.toast.complete",
        { title: loc.t(objective.titleKey) },
        OBJECTIVE_TOAST_TTL_MS,
      );
    }
    for (const achievement of r.newlyUnlockedAchievements) {
      toasts.push(
        "achievement.toast.unlocked",
        { title: loc.t(achievement.titleKey) },
        OBJECTIVE_TOAST_TTL_MS,
      );
    }
    inventoryScreen.setUnlockedTier(unlockedTierFor(progression.completedObjectives, TUTORIAL_OBJECTIVES));
    inventoryScreen.setUnlockedAchievements(progression.unlockedAchievements);
    renderTracker();
  }

  const activeKeyhintTimers = new Set<number>();
  function showKeyhint(id: "eat" | "tame" | "interact", key: string): void {
    if (!shouldShowKeyhint(keyhints, id)) return;
    keyhints = markKeyhintShown(keyhints, id);
    const chip = Keyhint(key, loc.t(`keyhint.${id}`), doc);
    chip.classList.add("laas-ui", "lw-keyhint-prompt");
    doc.body.appendChild(chip);
    const win = doc.defaultView ?? window;
    const timer = win.setTimeout(() => {
      chip.remove();
      activeKeyhintTimers.delete(timer);
    }, KEYHINT_TTL_MS);
    activeKeyhintTimers.add(timer);
  }

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
    bankScreen.setPlayerInventory(inventory);
    opts.audio?.play("eat");
    opts.feel?.trigger("eat");
    toasts.push("hud.toast.ate", { name: def.value.displayName }, LOOT_TOAST_TTL_MS);
    opts.onEat?.(def.value.food);
    recordProgress("eat");
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
    get progression() {
      return progression;
    },
    get keyhints() {
      return keyhints;
    },
    addLoot(stacks: readonly ItemStack[]): void {
      let gainedFood = false;
      for (const stack of stacks) {
        const added = inventory.add(stack.itemId, stack.count);
        if (!isOk(added)) continue; // full inventory: loot silently caps (no crash)
        inventory = added.value;
        const def = registry.get(stack.itemId);
        const name = isOk(def) ? def.value.displayName : stack.itemId;
        if (isOk(def) && def.value.food) gainedFood = true;
        toasts.push("hud.toast.loot", { name, count: stack.count }, LOOT_TOAST_TTL_MS);
      }
      hotbar.render(inventory);
      inventoryScreen.setInventory(inventory);
      bankScreen.setPlayerInventory(inventory);
      if (gainedFood) showKeyhint("eat", "H");
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
      bankScreen.setPlayerInventory(inventory);
    },
    recordProgress,
    maybeShowTameHint(): void {
      showKeyhint("tame", "T");
    },
    maybeShowInteractHint(): void {
      showKeyhint("interact", "E");
    },
    toast(messageKey, params): void {
      toasts.push(messageKey, params, LOOT_TOAST_TTL_MS);
    },
    setInventory(next: Inventory): void {
      inventory = next;
      hotbar.render(inventory);
      inventoryScreen.setInventory(inventory);
      bankScreen.setPlayerInventory(inventory);
    },
    selectedHotbarItemId(): string | null {
      return inventory.slots[hotbar.selected]?.itemId ?? null;
    },
    get bank() {
      return bank;
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onEatKeyDown);
      hotbar.dispose();
      toasts.dispose();
      tracker.dispose();
      inventoryScreen.dispose();
      inventoryButton.remove();
      bankScreen.dispose();
      bankButton.remove();
      const win = doc.defaultView ?? window;
      for (const timer of activeKeyhintTimers) win.clearTimeout(timer);
      activeKeyhintTimers.clear();
      doc.querySelectorAll(".lw-keyhint-prompt").forEach((el) => el.remove());
      if (ownsCrosshair) crosshair.dispose();
    },
  };
}
