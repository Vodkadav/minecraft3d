/**
 * Player-to-player trading (E5.3) — a two-party escrow state machine. Pure
 * and immutable: every transition returns a NEW `TradeSession` or a typed
 * error (err-explicit-result-handling). This module tracks CLAIMS only — it
 * never touches a real inventory; `HostSession` debits/credits the two
 * peers' authoritative inventories atomically once both sides confirm, and
 * revalidates every claimed stack against live holdings before it does (see
 * `HostSession.ts` — offer-time claims here are never trusted at face value).
 *
 * Cozy/no-scam invariant: ANY offer change resets BOTH confirms — a peer can
 * never sneak a worse deal past an already-confirmed partner. Cancelling (by
 * either side, or a disconnect) is a full no-op rollback: nothing was ever
 * moved out of either inventory until `complete()`, so there is nothing to
 * undo but the escrow record itself.
 */

import { err, ok, type Result } from "../Result";

export interface TradeStack {
  readonly itemId: string;
  readonly count: number;
}

export type TradeStatus = "negotiating" | "completed" | "cancelled";

export interface TradeSession {
  readonly id: string;
  readonly peers: readonly [string, string];
  readonly offers: Readonly<Record<string, readonly TradeStack[]>>;
  readonly confirmed: Readonly<Record<string, boolean>>;
  readonly status: TradeStatus;
}

export type TradeError =
  | { readonly kind: "SamePeer" }
  | { readonly kind: "NotNegotiating" }
  | { readonly kind: "UnknownPeer"; readonly peerId: string }
  | { readonly kind: "TooManyStacks"; readonly count: number }
  | { readonly kind: "InvalidStack"; readonly itemId: string; readonly count: number }
  | { readonly kind: "NotReady" };

/** Small cap (cozy scope, not a real inventory ceiling) — mirrors the wire
 *  bound in `Protocol.ts` so the domain and the trust boundary agree. */
export const MAX_TRADE_OFFER_STACKS = 8;

function isParticipant(trade: TradeSession, peerId: string): boolean {
  return trade.peers[0] === peerId || trade.peers[1] === peerId;
}

function isValidStack(s: TradeStack): boolean {
  return (
    typeof s.itemId === "string" &&
    s.itemId.length > 0 &&
    Number.isInteger(s.count) &&
    s.count > 0
  );
}

/** Open a new escrow between two peers. Nothing is offered yet. */
export function proposeTrade(id: string, peerA: string, peerB: string): Result<TradeSession, TradeError> {
  if (peerA === peerB) return err({ kind: "SamePeer" });
  return ok({
    id,
    peers: [peerA, peerB],
    offers: { [peerA]: [], [peerB]: [] },
    confirmed: { [peerA]: false, [peerB]: false },
    status: "negotiating",
  });
}

/**
 * Replace `peerId`'s offered stacks. Anti-scam: this ALWAYS resets both
 * sides' confirm flags, even the offerer's own — an already-confirmed trade
 * can never be silently reworded underneath a confirmed partner.
 */
export function setOffer(
  trade: TradeSession,
  peerId: string,
  offer: readonly TradeStack[],
): Result<TradeSession, TradeError> {
  if (trade.status !== "negotiating") return err({ kind: "NotNegotiating" });
  if (!isParticipant(trade, peerId)) return err({ kind: "UnknownPeer", peerId });
  if (offer.length > MAX_TRADE_OFFER_STACKS) return err({ kind: "TooManyStacks", count: offer.length });
  for (const s of offer) {
    if (!isValidStack(s)) return err({ kind: "InvalidStack", itemId: s.itemId, count: s.count });
  }
  const [a, b] = trade.peers;
  return ok({
    ...trade,
    offers: { ...trade.offers, [peerId]: offer },
    confirmed: { [a]: false, [b]: false },
  });
}

/** Mark `peerId` as accepting the CURRENT offers as they stand. */
export function confirm(trade: TradeSession, peerId: string): Result<TradeSession, TradeError> {
  if (trade.status !== "negotiating") return err({ kind: "NotNegotiating" });
  if (!isParticipant(trade, peerId)) return err({ kind: "UnknownPeer", peerId });
  return ok({ ...trade, confirmed: { ...trade.confirmed, [peerId]: true } });
}

/** True once both participants have confirmed the current offers. */
export function bothConfirmed(trade: TradeSession): boolean {
  return trade.status === "negotiating" && trade.peers.every((p) => trade.confirmed[p] === true);
}

/** Seal the trade once both sides are confirmed. The CALLER (`HostSession`)
 *  is responsible for the actual atomic inventory swap — this only advances
 *  the escrow's own state once that swap has committed. */
export function complete(trade: TradeSession): Result<TradeSession, TradeError> {
  if (!bothConfirmed(trade)) return err({ kind: "NotReady" });
  return ok({ ...trade, status: "completed" });
}

/** Either side cancelling, OR a disconnect — same full-rollback outcome:
 *  nothing was ever moved, so cancelling just closes the escrow record. */
export function cancel(trade: TradeSession): Result<TradeSession, TradeError> {
  if (trade.status !== "negotiating") return err({ kind: "NotNegotiating" });
  return ok({ ...trade, status: "cancelled" });
}
