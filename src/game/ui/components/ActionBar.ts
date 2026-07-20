/**
 * ActionBar (E8.7 HUD cohesion) — a togglable, hotbar-adjacent bar of
 * ability/consumable slots. Opt-in and OFF by default, "N" toggles it —
 * the same posture as `PartyPanel`'s "P" / `CombatMeterPanel`'s "L" (a
 * no-flags boot stays visually identical). Presentation only: driven by
 * `domain/ui/ActionBarState.ts`'s pure slot builders; activating a slot only
 * calls back out (`onActivate`) — this component never resolves a cast or
 * consumes an item itself, mirroring `CombatMeterPanel`'s "presentation
 * only, the composition root owns the real effect" posture.
 *
 * Slot markup deliberately mirrors `Hotbar.ts`'s (`.lw-hotbar-slot`'s key/
 * name/icon layout, same size/radius tokens) so the two bars read as one
 * family stacked on top of each other — the E8.7 cohesion goal made literal.
 *
 * Keybinding: Shift+1..Shift+9 activate slots 1-9 (bare 1-9 stays the
 * hotbar's own — see `Hotbar.ts`); a real `<button>` per slot keeps mouse
 * click and Tab+Enter/Space working without any extra wiring.
 *
 * Icons: ability slots render a text label — no per-ability icon glyph
 * source exists yet (`AbilitySpec` carries no icon field), so this mirrors
 * `Hotbar.ts`'s own pre-icon-system convention ("still legible, still
 * keyboard-navigable"). Consumable slots reuse the real item icon + rarity
 * ring + `RichTooltip`, exactly like `Hotbar.ts`/`InventoryGrid.ts`.
 */

import type { ActionBarSlot } from "../../domain/ui/ActionBarState";
import { actionBarIndexForDigit } from "../../domain/ui/ActionBarState";
import { buildTooltipModel } from "../../domain/ui/TooltipModel";
import { isOk } from "../../domain/Result";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { Localizer } from "../../application/i18n/Localizer";
import { createItemIconEl } from "../icons/ItemIconElement";
import { rarityTierForItemTier } from "../icons/ItemRarity";
import { attachTooltip, type TooltipHandle } from "./Tooltip";
import { RichTooltip, type RichTooltipHandle } from "./RichTooltip";
import { injectStyles } from "../styles";

export interface ActionBarOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  onActivate?(slot: ActionBarSlot, index: number): void;
  readonly doc?: Document;
}

export interface ActionBarHandle {
  readonly el: HTMLElement;
  readonly visible: boolean;
  setVisible(v: boolean): void;
  render(slots: readonly ActionBarSlot[]): void;
  dispose(): void;
}

function isTextInputFocused(doc: Document): boolean {
  const el = doc.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable === true;
}

export function ActionBar(opts: ActionBarOptions): ActionBarHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  const title = doc.createElement("div");
  title.className = "lw-action-bar-title";
  title.textContent = opts.loc.t("actionBar.title");

  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "laas-ui lw-button";
  closeBtn.dataset.variant = "quiet";
  closeBtn.textContent = opts.loc.t("actionBar.close");
  closeBtn.setAttribute("aria-label", opts.loc.t("actionBar.close.aria"));
  closeBtn.addEventListener("click", () => setVisible(false));

  const header = doc.createElement("div");
  header.className = "lw-action-bar-header";
  header.append(title, closeBtn);

  const list = doc.createElement("div");
  list.className = "lw-action-bar-slots";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", opts.loc.t("actionBar.aria"));

  const panel = doc.createElement("section");
  panel.className = "laas-ui lw-panel lw-action-bar";
  panel.setAttribute("aria-label", opts.loc.t("actionBar.title"));
  panel.append(header, list);
  panel.style.display = "none";
  doc.body.appendChild(panel);

  let visible = false;
  let currentSlots: readonly ActionBarSlot[] = [];
  const tooltips: (TooltipHandle | RichTooltipHandle | undefined)[] = [];

  function setVisible(v: boolean): void {
    visible = v;
    panel.style.display = v ? "block" : "none";
  }

  function disposeTooltips(): void {
    for (const t of tooltips) t?.dispose();
    tooltips.length = 0;
  }

  function activate(index: number): void {
    const slot = currentSlots[index];
    if (!slot) return;
    opts.onActivate?.(slot, index);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isTextInputFocused(doc)) return;
    if (e.code === "KeyN") {
      setVisible(!visible);
      return;
    }
    if (e.code === "Escape" && visible) {
      setVisible(false);
      return;
    }
    if (!e.shiftKey) return;
    const digit = Number(e.key);
    const index = actionBarIndexForDigit(digit);
    if (index === null) return;
    e.preventDefault();
    activate(index);
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    el: panel,
    get visible() {
      return visible;
    },
    setVisible,
    render(slots: readonly ActionBarSlot[]): void {
      currentSlots = slots;
      disposeTooltips();
      list.replaceChildren();

      slots.forEach((slot, i) => {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "lw-action-slot";
        btn.dataset.kind = slot.kind;

        const keyLabel = doc.createElement("span");
        keyLabel.className = "lw-action-slot-key";
        keyLabel.textContent = `⇧${i + 1}`; // "⇧1".."⇧9"
        btn.appendChild(keyLabel);

        if (slot.itemId) {
          const def = opts.registry.get(slot.itemId);
          const rarityTier = isOk(def) ? rarityTierForItemTier(def.value.tier) : "common";
          btn.appendChild(createItemIconEl(doc, slot.itemId, slot.displayName, isOk(def) ? def.value.tags : [], { rarityTier }));
        } else {
          const name = doc.createElement("span");
          name.className = "lw-action-slot-name";
          name.textContent = slot.displayName;
          btn.appendChild(name);
        }

        if (slot.count !== undefined) {
          const count = doc.createElement("span");
          count.className = "lw-action-slot-count";
          count.textContent = String(slot.count);
          btn.appendChild(count);
        }

        if (slot.readyFraction < 1) {
          const cooldown = doc.createElement("div");
          cooldown.className = "lw-action-slot-cooldown";
          cooldown.style.transform = `scaleY(${1 - slot.readyFraction})`;
          btn.appendChild(cooldown);
        }

        const ariaLabel =
          slot.count !== undefined
            ? opts.loc.t("actionBar.slot.consumable.aria", { name: slot.displayName, n: slot.count })
            : opts.loc.t("actionBar.slot.ability.aria", { name: slot.displayName });
        btn.setAttribute("aria-label", ariaLabel);
        btn.addEventListener("click", () => activate(i));

        if (slot.kind === "consumable" && slot.itemId) {
          const def = opts.registry.get(slot.itemId);
          const rarityTier = isOk(def) ? rarityTierForItemTier(def.value.tier) : "common";
          const model = buildTooltipModel({
            itemId: slot.itemId,
            registry: opts.registry,
            t: (k, params) => opts.loc.t(k, params),
            quantity: slot.count,
            rarityTier,
          });
          tooltips[i] = isOk(model) ? RichTooltip({ doc, anchor: btn, model: model.value }) : undefined;
        } else {
          tooltips[i] = attachTooltip(btn, slot.displayName);
        }

        list.appendChild(btn);
      });
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      disposeTooltips();
      panel.remove();
    },
  };
}
