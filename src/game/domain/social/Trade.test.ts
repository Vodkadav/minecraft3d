import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import {
  MAX_TRADE_OFFER_STACKS,
  bothConfirmed,
  cancel,
  complete,
  confirm,
  proposeTrade,
  setOffer,
  type TradeSession,
} from "./Trade";

function must(trade: ReturnType<typeof proposeTrade>): TradeSession {
  if (!isOk(trade)) throw new Error("setup failed");
  return trade.value;
}

describe("proposeTrade", () => {
  it("opens a negotiating trade with empty offers and unconfirmed sides", () => {
    const trade = must(proposeTrade("trade:1", "alice", "bob"));
    expect(trade).toEqual({
      id: "trade:1",
      peers: ["alice", "bob"],
      offers: { alice: [], bob: [] },
      confirmed: { alice: false, bob: false },
      status: "negotiating",
    });
  });

  it("rejects trading with yourself", () => {
    const r = proposeTrade("trade:1", "alice", "alice");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "SamePeer" });
  });
});

describe("setOffer", () => {
  it("replaces the offerer's stacks", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    const r = setOffer(trade, "alice", [{ itemId: "wood", count: 5 }]);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.offers.alice).toEqual([{ itemId: "wood", count: 5 }]);
  });

  it("leaves the other side's offer untouched", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(setOffer(trade, "bob", [{ itemId: "stone", count: 2 }]));
    trade = must2(setOffer(trade, "alice", [{ itemId: "wood", count: 5 }]));
    expect(trade.offers.bob).toEqual([{ itemId: "stone", count: 2 }]);
  });

  it("rejects an offer from a non-participant", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    const r = setOffer(trade, "mallory", [{ itemId: "wood", count: 1 }]);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "UnknownPeer", peerId: "mallory" });
  });

  it("rejects more than the max offer stacks", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    const tooMany = Array.from({ length: MAX_TRADE_OFFER_STACKS + 1 }, (_, i) => ({
      itemId: `item${i}`,
      count: 1,
    }));
    const r = setOffer(trade, "alice", tooMany);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("TooManyStacks");
  });

  it("accepts exactly the max offer stacks", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    const atCap = Array.from({ length: MAX_TRADE_OFFER_STACKS }, (_, i) => ({
      itemId: `item${i}`,
      count: 1,
    }));
    const r = setOffer(trade, "alice", atCap);
    expect(isOk(r)).toBe(true);
  });

  it("rejects a non-positive or non-integer count", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    for (const bad of [0, -1, 1.5]) {
      const r = setOffer(trade, "alice", [{ itemId: "wood", count: bad }]);
      expect(isErr(r)).toBe(true);
    }
  });

  it("rejects an empty itemId", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    const r = setOffer(trade, "alice", [{ itemId: "", count: 1 }]);
    expect(isErr(r)).toBe(true);
  });

  it("rejects setting an offer on a completed or cancelled trade", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(cancel(trade));
    const r = setOffer(trade, "alice", [{ itemId: "wood", count: 1 }]);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "NotNegotiating" });
  });

  it("ANY offer change resets BOTH confirms, including the offerer's own (anti-scam)", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(setOffer(trade, "alice", [{ itemId: "wood", count: 5 }]));
    trade = must2(setOffer(trade, "bob", [{ itemId: "stone", count: 2 }]));
    trade = must2(confirm(trade, "alice"));
    trade = must2(confirm(trade, "bob"));
    expect(bothConfirmed(trade)).toBe(true);

    // bob quietly reduces what he's offering after alice already confirmed
    trade = must2(setOffer(trade, "bob", [{ itemId: "stone", count: 1 }]));
    expect(trade.confirmed).toEqual({ alice: false, bob: false });
    expect(bothConfirmed(trade)).toBe(false);

    // alice re-offering the SAME stacks still resets her own confirm too
    trade = must2(confirm(trade, "alice"));
    trade = must2(confirm(trade, "bob"));
    trade = must2(setOffer(trade, "alice", [{ itemId: "wood", count: 5 }]));
    expect(trade.confirmed.alice).toBe(false);
  });
});

function must2(r: ReturnType<typeof setOffer>): TradeSession {
  if (!isOk(r)) throw new Error("setOffer failed: " + JSON.stringify((r as { error: unknown }).error));
  return r.value;
}

describe("confirm / bothConfirmed / complete", () => {
  it("is not ready until both sides confirm", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(confirm(trade, "alice"));
    expect(bothConfirmed(trade)).toBe(false);
    trade = must2(confirm(trade, "bob"));
    expect(bothConfirmed(trade)).toBe(true);
  });

  it("rejects confirm from a non-participant", () => {
    const trade = must(proposeTrade("t", "alice", "bob"));
    const r = confirm(trade, "mallory");
    expect(isErr(r)).toBe(true);
  });

  it("complete() fails until both confirmed", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(confirm(trade, "alice"));
    const r = complete(trade);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toEqual({ kind: "NotReady" });
  });

  it("complete() succeeds once both confirmed and marks the trade completed", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(confirm(trade, "alice"));
    trade = must2(confirm(trade, "bob"));
    const r = complete(trade);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.status).toBe("completed");
  });

  it("a completed trade can never be confirmed, offered on, or cancelled again", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(confirm(trade, "alice"));
    trade = must2(confirm(trade, "bob"));
    trade = must2(complete(trade));
    expect(isErr(confirm(trade, "alice"))).toBe(true);
    expect(isErr(setOffer(trade, "alice", []))).toBe(true);
    expect(isErr(cancel(trade))).toBe(true);
  });
});

describe("cancel (covers both explicit cancel and disconnect rollback)", () => {
  it("cancels a negotiating trade with nothing lost (no inventory ever touched here)", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(setOffer(trade, "alice", [{ itemId: "wood", count: 5 }]));
    const r = cancel(trade);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.status).toBe("cancelled");
      // the escrow claim is still visible for UI purposes, but status gates
      // every mutating transition off — nothing further can happen to it.
      expect(r.value.offers.alice).toEqual([{ itemId: "wood", count: 5 }]);
    }
  });

  it("cancelling an already-cancelled trade is rejected, not a silent no-op", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(cancel(trade));
    expect(isErr(cancel(trade))).toBe(true);
  });

  it("either side can cancel mid-negotiation, even after one side confirmed", () => {
    let trade = must(proposeTrade("t", "alice", "bob"));
    trade = must2(confirm(trade, "alice"));
    const r = cancel(trade);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.status).toBe("cancelled");
  });
});
