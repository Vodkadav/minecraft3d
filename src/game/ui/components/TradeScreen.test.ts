// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { isOk } from "../../domain/Result";
import { Inventory } from "../../domain/inventory/Inventory";
import { ItemRegistry } from "../../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../domain/items/starterItems";
import type { TradeStateMsg } from "../../domain/net/Protocol";
import { createLocalizer } from "../i18n/strings";
import { mountTradeScreen } from "./TradeScreen";

function registry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("bad registry");
  return r.value;
}

function negotiating(overrides: Partial<TradeStateMsg> = {}): TradeStateMsg {
  return {
    kind: "tradeState",
    tradeId: "trade:1",
    peerA: "me",
    peerB: "them",
    offerA: [],
    offerB: [],
    confirmedA: false,
    confirmedB: false,
    status: "negotiating",
    ...overrides,
  };
}

describe("mountTradeScreen", () => {
  it("starts closed", () => {
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: registry() });
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("opens with the other player's name, releasing pointer lock and pausing input", () => {
    const exitPointerLock = vi.fn();
    (document as unknown as { exitPointerLock: () => void }).exitPointerLock = exitPointerLock;
    const setInputEnabled = vi.fn();
    const reg = registry();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg, setInputEnabled });

    screen.open({
      amPeerA: true,
      theirName: "Bob",
      myInventory: Inventory.empty(reg, 9),
      onOffer: () => {},
      onConfirm: () => {},
      onCancel: () => {},
    });

    expect(screen.isOpen).toBe(true);
    expect(exitPointerLock).toHaveBeenCalled();
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    expect(document.querySelector(".lw-trade-their-name")?.textContent).toContain("Bob");
    screen.dispose();
  });

  it("Escape closes, fires onCancel, and restores input", () => {
    const setInputEnabled = vi.fn();
    const onCancel = vi.fn();
    const reg = registry();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg, setInputEnabled });
    screen.open({
      amPeerA: true,
      theirName: "Bob",
      myInventory: Inventory.empty(reg, 9),
      onOffer: () => {},
      onConfirm: () => {},
      onCancel,
    });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(screen.isOpen).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(true);
    expect(onCancel).toHaveBeenCalled();
    screen.dispose();
  });

  it("dragging a stack from your inventory into your offer fires onOffer, never mutates locally", () => {
    const reg = registry();
    const onOffer = vi.fn();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg });
    let myInventory = Inventory.empty(reg, 9);
    const added = myInventory.add("wood", 5);
    if (!isOk(added)) throw new Error("setup");
    myInventory = added.value;

    screen.open({
      amPeerA: true,
      theirName: "Bob",
      myInventory,
      onOffer,
      onConfirm: () => {},
      onCancel: () => {},
    });

    const grids = document.querySelectorAll(".lw-inv-grid");
    const myGridEl = grids[0] as HTMLElement;
    const offerGridEl = grids[1] as HTMLElement;
    const myFirstSlot = myGridEl.querySelector('[role="gridcell"]') as HTMLElement;
    const offerFirstSlot = offerGridEl.querySelector('[role="gridcell"]') as HTMLElement;

    myFirstSlot.dispatchEvent(
      Object.assign(new Event("dragstart", { bubbles: true, cancelable: true }), {
        dataTransfer: { setData: vi.fn(), getData: vi.fn() },
      }),
    );
    offerFirstSlot.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));

    expect(onOffer).toHaveBeenCalledWith([{ itemId: "wood", count: 5 }]);
    screen.dispose();
  });

  it("render() shows THEIR offer as a read-only list and reflects confirm status for both sides", () => {
    const reg = registry();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg });
    screen.open({
      amPeerA: true,
      theirName: "Bob",
      myInventory: Inventory.empty(reg, 9),
      onOffer: () => {},
      onConfirm: () => {},
      onCancel: () => {},
    });

    screen.render(
      negotiating({
        offerB: [{ itemId: "stone", count: 3 }],
        confirmedB: true,
      }),
      Inventory.empty(reg, 9),
    );

    const items = [...document.querySelectorAll(".lw-trade-offer-item")];
    expect(items.some((el) => el.textContent?.includes("Stone"))).toBe(true);
    const statuses = [...document.querySelectorAll(".lw-trade-confirm-status")].map((el) => el.textContent);
    expect(statuses).toContain("They confirmed!");
    screen.dispose();
  });

  it("render() populates your offer grid from the host echo, not local staging", () => {
    const reg = registry();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg });
    screen.open({
      amPeerA: false, // I am peerB this time
      theirName: "Alice",
      myInventory: Inventory.empty(reg, 9),
      onOffer: () => {},
      onConfirm: () => {},
      onCancel: () => {},
    });

    screen.render(negotiating({ offerB: [{ itemId: "wood", count: 4 }] }), Inventory.empty(reg, 9));

    const grids = document.querySelectorAll(".lw-inv-grid");
    const offerGridEl = grids[1] as HTMLElement;
    expect(offerGridEl.textContent).toContain("Wood");
    screen.dispose();
  });

  it("confirm/cancel buttons call the given callbacks", () => {
    const reg = registry();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg });
    screen.open({
      amPeerA: true,
      theirName: "Bob",
      myInventory: Inventory.empty(reg, 9),
      onOffer: () => {},
      onConfirm,
      onCancel,
    });

    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent === "Confirm")?.click();
    expect(onConfirm).toHaveBeenCalled();
    buttons.find((b) => b.textContent === "Cancel Trade")?.click();
    expect(onCancel).toHaveBeenCalled();
    expect(screen.isOpen).toBe(false); // cancel also closes the window
    screen.dispose();
  });

  it("auto-closes once the host resolves the trade as completed or cancelled", () => {
    const reg = registry();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg });
    screen.open({
      amPeerA: true,
      theirName: "Bob",
      myInventory: Inventory.empty(reg, 9),
      onOffer: () => {},
      onConfirm: () => {},
      onCancel: () => {},
    });
    screen.render(negotiating({ status: "completed" }), Inventory.empty(reg, 9));
    expect(screen.isOpen).toBe(false);
    screen.dispose();
  });

  it("render() is a no-op while closed", () => {
    const reg = registry();
    const screen = mountTradeScreen({ loc: createLocalizer("en"), registry: reg });
    expect(() => screen.render(negotiating(), Inventory.empty(reg, 9))).not.toThrow();
    screen.dispose();
  });
});
