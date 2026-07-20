/**
 * BankScreen — the account bank overlay (Phase E4.4), reusing the `ChestScreen`
 * two-grid pattern: the player's inventory on the left, the active bank tab
 * on the right, drag/drop between them via the same `transferBetween` seam.
 * Adds a tab switcher the chest doesn't need — "Shared" (persists across
 * every character/world on the account) vs. "Character" (private to
 * `characterId`) — swapping which live `Inventory` the right grid renders.
 *
 * Self-toggling like `InventoryScreen` (`K` opens/closes, ignored while a
 * text input has focus; Escape always closes) rather than opened by an
 * external interaction like `ChestScreen`, since the bank isn't tied to a
 * placed object in the world.
 *
 * SINGLE-PLAYER/HOST-LOCAL ONLY (E0.4 security caveat): this screen mutates
 * a bank the composition root owns locally; it has no networked
 * deposit/withdraw path. Wiring joiner access needs the join-claim
 * inventory-seeding trust decision revisited first.
 */

import { isOk } from "../domain/Result";
import { transferBetween } from "../domain/inventory/CrossInventoryTransfer";
import { Inventory } from "../domain/inventory/Inventory";
import type { ItemRegistry } from "../domain/items/ItemRegistry";
import { Bank, SHARED_BANK_TAB } from "../domain/storage/Bank";
import type { Localizer } from "../application/i18n/Localizer";
import { Button } from "./components/Button";
import { InventoryGrid } from "./components/InventoryGrid";
import { Panel } from "./components/Panel";
import { createPanelEmblemEl } from "./icons/PanelEmblem";
import { injectStyles } from "./styles";

export interface BankScreenOptions {
  readonly loc: Localizer;
  readonly registry: ItemRegistry;
  /** Whose private tab the "Character" tab renders — a stable per-owner id. */
  readonly characterId: string;
  setInputEnabled?(enabled: boolean): void;
  /** Fired after any successful transfer/move — the composition root
   *  persists the resulting bank (BankPersistence) and player inventory. */
  onChange?(player: Inventory, bank: Bank): void;
  readonly doc?: Document;
}

export interface BankScreenHandle {
  readonly isOpen: boolean;
  open(playerInventory: Inventory, bank: Bank): void;
  close(): void;
  toggle(): void;
  setPlayerInventory(inv: Inventory): void;
  setBank(bank: Bank): void;
  readonly bank: Bank;
  dispose(): void;
}

type BankTab = typeof SHARED_BANK_TAB | "character";

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}

export function mountBankScreen(opts: BankScreenOptions): BankScreenHandle {
  const doc = opts.doc ?? document;
  injectStyles(doc);

  let open = false;
  let player = Inventory.empty(opts.registry, 0);
  let bank = Bank.empty(opts.registry, { sharedCapacity: 0, tabCapacity: 0 });
  let activeTab: BankTab = SHARED_BANK_TAB;

  function activeTabId(): string {
    return activeTab === SHARED_BANK_TAB ? SHARED_BANK_TAB : opts.characterId;
  }

  const overlay = doc.createElement("div");
  overlay.className = "laas-ui lw-inv-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", opts.loc.t("bank.title"));

  const tabs = doc.createElement("div");
  tabs.className = "lw-inv-tabs";
  const sharedTabBtn = doc.createElement("button");
  sharedTabBtn.type = "button";
  sharedTabBtn.className = "laas-ui lw-button";
  sharedTabBtn.textContent = opts.loc.t("bank.tab.shared");
  const characterTabBtn = doc.createElement("button");
  characterTabBtn.type = "button";
  characterTabBtn.className = "laas-ui lw-button";
  characterTabBtn.dataset.variant = "quiet";
  characterTabBtn.textContent = opts.loc.t("bank.tab.character");
  tabs.append(sharedTabBtn, characterTabBtn);

  const closeBtn = Button({
    label: opts.loc.t("inventory.close"),
    ariaLabel: opts.loc.t("bank.close.aria"),
    variant: "quiet",
    onClick: () => close(),
  });

  const header = doc.createElement("div");
  header.className = "lw-inv-header";
  const headerLead = doc.createElement("div");
  headerLead.className = "lw-panel-title-wrap";
  headerLead.append(createPanelEmblemEl(doc, "bank"), tabs);
  header.append(headerLead, closeBtn);

  const playerGrid = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("placeable.chest.player"),
    gridId: "bank-player",
    doc,
    onChange: (next) => {
      player = next;
      opts.onChange?.(player, bank);
    },
    onExternalDrop: (sourceGridId, sourceIndex) => {
      if (sourceGridId !== "bank-tab") return;
      const r = transferBetween(bank.tab(activeTabId()), player, sourceIndex);
      if (!isOk(r)) return;
      bank = bank.setTab(activeTabId(), r.value.from);
      player = r.value.to;
      playerGrid.render(player);
      bankGrid.render(bank.tab(activeTabId()));
      opts.onChange?.(player, bank);
    },
  });

  const bankGrid = InventoryGrid({
    registry: opts.registry,
    loc: opts.loc,
    ariaLabel: opts.loc.t("bank.title"),
    hotbarSize: 0,
    gridId: "bank-tab",
    doc,
    onChange: (next) => {
      bank = bank.setTab(activeTabId(), next);
      opts.onChange?.(player, bank);
    },
    onExternalDrop: (sourceGridId, sourceIndex) => {
      if (sourceGridId !== "bank-player") return;
      const r = transferBetween(player, bank.tab(activeTabId()), sourceIndex);
      if (!isOk(r)) return;
      player = r.value.from;
      bank = bank.setTab(activeTabId(), r.value.to);
      playerGrid.render(player);
      bankGrid.render(bank.tab(activeTabId()));
      opts.onChange?.(player, bank);
    },
  });

  const body = doc.createElement("div");
  body.className = "lw-chest-body";
  body.append(playerGrid.el, bankGrid.el);

  const panel = Panel([header, body], { className: "lw-inv-overlay-panel" });
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);

  function applyTab(): void {
    sharedTabBtn.dataset.variant = activeTab === SHARED_BANK_TAB ? "" : "quiet";
    sharedTabBtn.setAttribute("aria-selected", String(activeTab === SHARED_BANK_TAB));
    characterTabBtn.dataset.variant = activeTab === "character" ? "" : "quiet";
    characterTabBtn.setAttribute("aria-selected", String(activeTab === "character"));
    bankGrid.render(bank.tab(activeTabId()));
  }
  sharedTabBtn.addEventListener("click", () => {
    activeTab = SHARED_BANK_TAB;
    applyTab();
  });
  characterTabBtn.addEventListener("click", () => {
    activeTab = "character";
    applyTab();
  });
  applyTab();

  function close(): void {
    if (!open) return;
    open = false;
    overlay.hidden = true;
    opts.setInputEnabled?.(true);
  }
  function open_(): void {
    if (open) return;
    open = true;
    overlay.hidden = false;
    playerGrid.render(player);
    applyTab();
    doc.exitPointerLock?.();
    opts.setInputEnabled?.(false);
  }
  function toggle(): void {
    if (open) close();
    else open_();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
      return;
    }
    if ((e.key === "k" || e.key === "K") && !isTextInput(doc.activeElement)) {
      e.preventDefault();
      toggle();
    }
  }
  (doc.defaultView ?? window).addEventListener("keydown", onKeyDown);

  return {
    get isOpen() {
      return open;
    },
    open(playerInventory, bankState): void {
      player = playerInventory;
      bank = bankState;
      open_();
    },
    close,
    toggle,
    setPlayerInventory(inv: Inventory): void {
      player = inv;
      if (open) playerGrid.render(player);
    },
    setBank(next: Bank): void {
      bank = next;
      if (open) bankGrid.render(bank.tab(activeTabId()));
    },
    get bank() {
      return bank;
    },
    dispose(): void {
      (doc.defaultView ?? window).removeEventListener("keydown", onKeyDown);
      playerGrid.dispose();
      bankGrid.dispose();
      overlay.remove();
    },
  };
}
