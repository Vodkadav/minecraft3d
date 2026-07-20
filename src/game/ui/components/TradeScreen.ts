/**
 * TradeScreen — the two-party trade window (E5.3), following `ChestScreen`'s
 * remote round-trip shape: this UI NEVER mutates any inventory or offer
 * locally, it only fires intents and renders whatever `render()` is called
 * with next (the host's authoritative `tradeState` + the player's own live
 * inventory). Unlike `ChestScreen` there is no host-local fast path — a
 * trade always crosses the wire even for the room's host, since the whole
 * point is two DIFFERENT peers' inventories, so this screen is unconditionally
 * "remote" (mirrors `ChestScreen.isRemote()===true`, just never false here).
 *
 * Layout mirrors `ChestScreen`'s two-column reuse: "Your inventory" (drag
 * source) + "Your offer" (drop target, an 8-slot staging `Inventory` built
 * fresh from the host's own echo every render) on one side; "Their offer" is
 * a read-only list (not draggable — it isn't yours to rearrange). Confirm is
 * symmetric on both sides with a plain "both must accept" line — cozy: no
 * timers, no pressure, either side can cancel any time.
 */

import { isOk } from "../../domain/Result";
import { Inventory } from "../../domain/inventory/Inventory";
import type { ItemRegistry } from "../../domain/items/ItemRegistry";
import type { TradeStackWire, TradeStateMsg } from "../../domain/net/Protocol";
import type { Localizer } from "../../application/i18n/Localizer";
import { itemDisplayName } from "../i18n/itemNames";
import { Button } from "./Button";
import { WindowFrame } from "./WindowFrame";
import { InventoryGrid, type InventoryGridHandle } from "./InventoryGrid";
import { injectStyles } from "../styles";

const OFFER_CAPACITY = 8;

export interface TradeScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  setInputEnabled?(enabled: boolean): void;
  readonly doc?: Document;
}

export interface TradeScreenOpenArgs {
  /** Which side of the wire's `tradeState` (peerA/peerB) is THIS player —
   *  needed to tell "my offer" apart from "their offer" in every render. */
  readonly amPeerA: boolean;
  readonly theirName: string;
  readonly myInventory: Inventory;
  /** The FULL new offer to claim — fires on every drag in/out of "your
   *  offer"; the host echoes the real result back via `render()`. */
  onOffer(offer: readonly TradeStackWire[]): void;
  onConfirm(): void;
  onCancel(): void;
}

export interface TradeScreenHandle {
  readonly isOpen: boolean;
  open(args: TradeScreenOpenArgs): void;
  /** Reconciles from the host's authoritative trade state + this player's
   *  own live inventory (which keeps changing from `inventoryState` while
   *  the window is open). A no-op if closed or the trade isn't the open one. */
  render(state: TradeStateMsg, myInventory: Inventory): void;
  close(): void;
  dispose(): void;
}

function stacksToInventory(registry: ItemRegistry, stacks: readonly TradeStackWire[]): Inventory {
  const slots: (TradeStackWire | null)[] = Array.from({ length: OFFER_CAPACITY }, () => null);
  stacks.slice(0, OFFER_CAPACITY).forEach((s, i) => (slots[i] = s));
  const built = Inventory.fromSlots(registry, slots);
  return isOk(built) ? built.value : Inventory.empty(registry, OFFER_CAPACITY);
}

function inventoryToOffer(inventory: Inventory): readonly TradeStackWire[] {
  return inventory.slots
    .filter((s): s is { itemId: string; count: number } => s !== null)
    .map((s) => ({ itemId: s.itemId, count: s.count }));
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountTradeScreen(opts: TradeScreenOptions): TradeScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let open = false;
  let args: TradeScreenOpenArgs | null = null;
  let myInventory = Inventory.empty(opts.registry, 0);
  let myOffer = Inventory.empty(opts.registry, OFFER_CAPACITY);

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("trade.title"));

  const helpLine = doc.createElement("p");
  helpLine.className = "lw-trade-help";
  helpLine.textContent = opts.loc.t("trade.bothMustAccept");

  const myGrid: InventoryGridHandle = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("trade.yourInventory"),
    gridId: "trade-mine",
    doc,
    onChange: (next) => {
      // a local move/split WITHIN the player's own real inventory (not the
      // offer) is cosmetic client-side reorg only — the source of truth is
      // still whatever `inventoryState` echoes; keep it live so drags read
      // the current arrangement.
      myInventory = next;
    },
    onExternalDrop: (sourceGridId, sourceIndex) => {
      if (sourceGridId !== "trade-offer") return;
      const slot = myOffer.slots[sourceIndex];
      if (!slot) return;
      const next = inventoryToOffer(myOffer).filter((_, i) => i !== sourceIndex);
      args?.onOffer(next);
    },
  });

  const offerGrid: InventoryGridHandle = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("trade.yourOffer"),
    hotbarSize: 0,
    gridId: "trade-offer",
    doc,
    onExternalDrop: (sourceGridId, sourceIndex) => {
      if (sourceGridId !== "trade-mine") return;
      const slot = myInventory.slots[sourceIndex];
      if (!slot) return;
      const next = [...inventoryToOffer(myOffer), { itemId: slot.itemId, count: slot.count }];
      args?.onOffer(next);
    },
  });

  const theirOfferList = doc.createElement("ul");
  theirOfferList.className = "lw-trade-offer-list";
  theirOfferList.setAttribute("aria-label", opts.loc.t("trade.theirOffer"));

  const myColumn = doc.createElement("div");
  myColumn.className = "lw-chest-column";
  const myOfferLabel = doc.createElement("h3");
  myOfferLabel.textContent = opts.loc.t("trade.yourOffer");
  myColumn.append(doc.createTextNode(opts.loc.t("trade.yourInventory")), myGrid.el, myOfferLabel, offerGrid.el);

  const theirColumn = doc.createElement("div");
  theirColumn.className = "lw-chest-column";
  const theirLabel = doc.createElement("h3");
  theirLabel.className = "lw-trade-their-name";
  theirColumn.append(theirLabel, theirOfferList);

  const body = doc.createElement("div");
  body.className = "lw-chest-body";
  body.append(myColumn, theirColumn);

  const myConfirmStatus = doc.createElement("span");
  myConfirmStatus.className = "lw-trade-confirm-status";
  const theirConfirmStatus = doc.createElement("span");
  theirConfirmStatus.className = "lw-trade-confirm-status";

  const confirmBtn = Button({
    label: opts.loc.t("trade.confirm"),
    ariaLabel: opts.loc.t("trade.confirm.aria"),
    onClick: () => args?.onConfirm(),
  });
  const cancelBtn = Button({
    label: opts.loc.t("trade.cancel"),
    ariaLabel: opts.loc.t("trade.cancel.aria"),
    variant: "quiet",
    onClick: () => {
      args?.onCancel();
      close();
    },
  });

  const footer = doc.createElement("div");
  footer.className = "lw-trade-footer";
  footer.append(myConfirmStatus, theirConfirmStatus, confirmBtn, cancelBtn);

  const frame = WindowFrame({
    doc,
    title: opts.loc.t("trade.title"),
    emblem: "trade",
    close: {
      label: opts.loc.t("inventory.close"),
      ariaLabel: opts.loc.t("inventory.close.aria"),
      onClose: () => {
        args?.onCancel();
        close();
      },
    },
    body: [helpLine, body, footer],
    panelClassName: "lw-inv-overlay-panel",
  });
  overlay.appendChild(frame.panel);
  doc.body.appendChild(overlay);

  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    args = null;
    opts.setInputEnabled?.(true);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      args?.onCancel();
      close();
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    open(openArgs): void {
      args = openArgs;
      myInventory = openArgs.myInventory;
      myOffer = Inventory.empty(opts.registry, OFFER_CAPACITY);
      theirLabel.textContent = opts.loc.t("trade.withPlayer", { name: openArgs.theirName });
      open = true;
      overlay.hidden = false;
      myGrid.render(myInventory);
      offerGrid.render(myOffer);
      theirOfferList.replaceChildren();
      myConfirmStatus.textContent = opts.loc.t("trade.confirm.waiting");
      theirConfirmStatus.textContent = opts.loc.t("trade.confirm.waiting");
      doc.exitPointerLock?.();
      opts.setInputEnabled?.(false);
    },
    render(state, nextMyInventory): void {
      if (!open || !args) return;
      myInventory = nextMyInventory;
      const myOfferWire = args.amPeerA ? state.offerA : state.offerB;
      const theirOfferWire = args.amPeerA ? state.offerB : state.offerA;
      const myConfirmed = args.amPeerA ? state.confirmedA : state.confirmedB;
      const theirConfirmed = args.amPeerA ? state.confirmedB : state.confirmedA;

      myOffer = stacksToInventory(opts.registry, myOfferWire);
      myGrid.render(myInventory);
      offerGrid.render(myOffer);

      theirOfferList.replaceChildren();
      for (const stack of theirOfferWire) {
        const li = doc.createElement("li");
        li.className = "lw-trade-offer-item";
        const name = itemDisplayName(opts.loc, opts.registry, stack.itemId);
        li.textContent = opts.loc.t("trade.offerItem", { name, count: stack.count });
        theirOfferList.appendChild(li);
      }

      myConfirmStatus.textContent = opts.loc.t(
        myConfirmed ? "trade.confirm.you.confirmed" : "trade.confirm.waiting",
      );
      theirConfirmStatus.textContent = opts.loc.t(
        theirConfirmed ? "trade.confirm.them.confirmed" : "trade.confirm.waiting",
      );

      if (state.status === "completed" || state.status === "cancelled") {
        close();
      }
    },
    close,
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      myGrid.dispose();
      offerGrid.dispose();
      overlay.remove();
    },
  };
}

export { OFFER_CAPACITY as TRADE_OFFER_CAPACITY };
