/**
 * CampfireScreen — the minimal cooking-station UI (Workstream 8.4 / S7b):
 * one "Cook" button per raw ingredient the player is carrying that has a
 * campfire recipe, a progress readout while a job is running, and a
 * "Collect" button once it's done. All timing reads the tested `Campfire`
 * domain (`cookProgress`/`isCookDone`) against a caller-supplied game clock
 * (`nowMs`, ticked by the composition root so this stays deterministic and
 * pure of any `Date.now()` call of its own).
 */

import { cookProgress, isCookDone, type CampfireState } from "../../domain/placeables/Campfire";
import type { Recipe } from "../../domain/crafting/Crafting";
import type { Inventory } from "../../domain/inventory/Inventory";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { Localizer } from "../../application/i18n/Localizer";
import { itemDisplayName } from "../i18n/itemNames";
import { Button } from "./Button";
import { WindowFrame } from "./WindowFrame";
import { injectStyles } from "../styles";

export interface CampfireScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  readonly recipes: readonly Recipe[];
  setInputEnabled?(enabled: boolean): void;
  /** Sends the intent to start cooking the given raw item id. */
  onCook(itemId: string): void;
  /** Sends the intent to collect the finished job. */
  onCollect(): void;
  readonly doc?: Document;
}

export interface CampfireScreenHandle {
  readonly isOpen: boolean;
  open(playerInventory: Inventory, campfire: CampfireState, nowMs: number): void;
  /** Re-renders against fresh state (e.g. the host's broadcast reply, or a
   *  per-frame progress tick while open). */
  render(playerInventory: Inventory, campfire: CampfireState, nowMs: number): void;
  close(): void;
  dispose(): void;
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountCampfireScreen(opts: CampfireScreenOptions): CampfireScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let open = false;

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("placeable.campfire.title"));

  const body = doc.createElement("div");
  body.className = "lw-campfire-body";

  const frame = WindowFrame({
    doc,
    title: opts.loc.t("placeable.campfire.title"),
    close: {
      label: opts.loc.t("inventory.close"),
      ariaLabel: opts.loc.t("inventory.close.aria"),
      onClose: () => close(),
    },
    body: [body],
    panelClassName: "lw-inv-overlay-panel",
  });
  overlay.appendChild(frame.panel);
  doc.body.appendChild(overlay);

  function cookableItemIds(inventory: Inventory): string[] {
    const raw = new Set(
      opts.recipes.filter((r) => r.station === "campfire" && r.ingredients.length === 1).map((r) => r.ingredients[0]!.itemId),
    );
    return [...raw].filter((id) => inventory.has(id, 1));
  }

  function renderBody(inventory: Inventory, campfire: CampfireState, nowMs: number): void {
    body.replaceChildren();

    if (campfire.job) {
      const done = isCookDone(campfire.job, nowMs);
      const status = doc.createElement("p");
      status.className = "lw-campfire-status";
      status.textContent = done
        ? opts.loc.t("placeable.campfire.ready")
        : opts.loc.t("placeable.campfire.cooking", { pct: Math.round(cookProgress(campfire.job, nowMs) * 100) });
      body.appendChild(status);

      const collectBtn = Button({
        label: opts.loc.t("placeable.campfire.collect"),
        onClick: () => opts.onCollect(),
      });
      collectBtn.disabled = !done;
      body.appendChild(collectBtn);
      return;
    }

    const ids = cookableItemIds(inventory);
    if (ids.length === 0) {
      const empty = doc.createElement("p");
      empty.className = "lw-campfire-empty";
      empty.textContent = opts.loc.t("placeable.campfire.empty");
      body.appendChild(empty);
      return;
    }
    for (const itemId of ids) {
      const row = doc.createElement("div");
      row.className = "lw-campfire-row";
      row.dataset.itemId = itemId;
      const name = doc.createElement("span");
      name.textContent = itemDisplayName(opts.loc, opts.registry, itemId);
      const cookBtn = Button({
        label: opts.loc.t("placeable.campfire.cook"),
        onClick: () => opts.onCook(itemId),
      });
      row.append(name, cookBtn);
      body.appendChild(row);
    }
  }

  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    opts.setInputEnabled?.(true);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      close();
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    open(playerInventory, campfire, nowMs): void {
      open = true;
      overlay.hidden = false;
      renderBody(playerInventory, campfire, nowMs);
      doc.exitPointerLock?.();
      opts.setInputEnabled?.(false);
    },
    render(playerInventory, campfire, nowMs): void {
      if (open) renderBody(playerInventory, campfire, nowMs);
    },
    close,
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      overlay.remove();
    },
  };
}
