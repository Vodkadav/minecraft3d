/**
 * Host authority for M7 multiplayer (ADR 0002 §6): joiners send intents over
 * the NetTransport port; the host validates each against domain/net rules and
 * only then applies it (via injected hooks into the engine) and rebroadcasts
 * the resolved truth. Malformed or cheating traffic is dropped with a warning
 * — a hostile peer can never crash the host or move faster than the rules.
 *
 * E0.4: the host also holds each connected peer's AUTHORITATIVE inventory —
 * seeded on join, mutated only by validated intents (`inventoryOp`, and the
 * inventory-touching `placeableInteract` actions), never trusted from a
 * peer's own claim. A joiner never mutates its inventory locally; every
 * change is echoed back via a private `inventoryState` message.
 *
 * A clock fn is injected so pose speed checks are deterministic in tests.
 */

import { isErr, isOk } from "../domain/Result";
import { Inventory } from "../domain/inventory/Inventory";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import {
  remoteAllowedPlaceableAction,
  validateDig,
  validateInventoryOp,
  validatePlaceableInteract,
  validatePose,
  validateTradePropose,
} from "../domain/net/IntentRules";
import {
  parseMessage,
  type DigMsg,
  type FillMsg,
  type InteractAction,
  type InventoryOp,
  type NetMessage,
  type PlaceableAction,
  type PlaceableInteractMsg,
  type PoseMsg,
  type SerializedInventoryWire,
  type TradeStackWire,
  type WorldEdit,
} from "../domain/net/Protocol";
import {
  bothConfirmed,
  cancel as cancelTrade,
  complete as completeTrade,
  confirm as confirmTrade,
  proposeTrade,
  setOffer,
  type TradeSession,
} from "../domain/social/Trade";
import type { ChunkDelta, PlayerState } from "../domain/world/WorldSaveData";
import type { NetTransport } from "./ports/NetTransport";

/** What a joiner needs to boot the host's world (the `welcome` payload). */
export interface WorldSnapshot {
  readonly seed: number;
  readonly worldId: string;
  readonly name: string;
  readonly modifiedChunks: readonly ChunkDelta[];
  readonly entities: Readonly<Record<string, unknown>>;
}

/** A resolved placeable interaction (E0.4): the new placeable state to
 *  broadcast, and — for actions that create a stack out of thin air
 *  (withdraw/collect/harvest) — the item the ACTOR is granted. `HostSession`
 *  credits the grant into the SENDER's authoritative inventory; it never
 *  reaches the host's own inventory unless the host itself is the actor. */
export interface PlaceableHookOutcome {
  readonly state: unknown;
  readonly grant?: { readonly itemId: string; readonly count: number };
}

export interface HostSessionHooks {
  /** Apply a validated edit to the host's live world. */
  onWorldEdit(edit: WorldEdit): void;
  onEntityRemoved?(id: string): void;
  /** A validated joiner interaction — the host resolves it on its spawn field.
   *  peerId identifies the sender (needed for mount/dismount, which are keyed
   *  by rider, not by target — attack/harvest/feed ignore it). */
  onInteract?(action: InteractAction, targetId: string, peerId: string): void;
  /** A validated peer pose — lets the host app render remote avatars. */
  onPeerPose?(peerId: string, state: PlayerState): void;
  onPeerJoined?(peerId: string, playerName: string): void;
  onPeerLeft?(peerId: string): void;
  /** A validated placeable intent (Workstream 8.1) — the host resolves it
   *  against its own placeable state (chest/door/campfire/plot) and returns
   *  the new state (+ any grant) to broadcast, or `undefined`/`null` to
   *  reject silently (e.g. locked door, empty chest slot, no recipe) —
   *  mirrors the dig/fill "drop silently on rejection" contract, never a
   *  throw. */
  onPlaceableInteract?(
    action: PlaceableAction,
    placeableId: string,
    peerId: string,
    itemId: string | undefined,
    count: number | undefined,
  ): PlaceableHookOutcome | undefined | null;
  /** A validated `pickup` interact intent (E0.5) — peek the ground item's
   *  stack WITHOUT mutating host state (undefined = nothing there / already
   *  gone). `HostSession` credits the sender's authoritative inventory FIRST
   *  and only calls `onGroundItemRemove` on success — a full bag leaves the
   *  drop on the ground, the same never-conjure/never-lose contract as
   *  withdraw/harvest. */
  onGroundItemPeek?(targetId: string): { itemId: string; count: number } | undefined;
  onGroundItemRemove?(targetId: string): void;
}

export interface HostSessionDeps {
  readonly clock?: () => number;
  /** The item catalogue peer inventories validate against (E0.4). Omitted
   *  (e.g. tests unrelated to inventory) ⇒ an empty registry, which simply
   *  makes every inventory op fail closed — nothing is ever conjured or
   *  lost, the feature just does nothing. */
  readonly registry?: ItemRegistry;
  /** Slot count a fresh peer inventory is seeded with. */
  readonly playerInventoryCapacity?: number;
}

const DEFAULT_PLAYER_INVENTORY_CAPACITY = 27;

function emptyRegistry(): ItemRegistry {
  const created = ItemRegistry.create([]);
  // an empty definition table can never collide — this is a programmer-error
  // invariant, not an expected failure (err-explicit-result-handling §2).
  if (!isOk(created)) throw new Error("empty item registry construction cannot fail");
  return created.value;
}

interface PeerRecord {
  lastPose: { state: PlayerState; at: number } | null;
  inventory: Inventory;
  /** True once a join claim has been applied — later `join` messages (the
   *  joiner re-announces on a timer) must never re-seed the authoritative
   *  copy, or a peer could rewrite its own inventory at will. */
  inventorySeeded: boolean;
}

export class HostSession {
  private readonly peers = new Map<string, PeerRecord>();
  private readonly clock: () => number;
  private readonly registry: ItemRegistry;
  private readonly playerInventoryCapacity: number;
  /** E5.3: at most one active (negotiating) trade per peer — cozy scope,
   *  no juggling multiple simultaneous trades. */
  private readonly trades = new Map<string, TradeSession>();
  private readonly activeTradeByPeer = new Map<string, string>();
  private nextTradeId = 1;

  constructor(
    private readonly transport: NetTransport,
    private readonly snapshot: () => WorldSnapshot,
    private readonly hooks: HostSessionHooks,
    deps: HostSessionDeps = {},
  ) {
    this.clock = deps.clock ?? (() => Date.now());
    this.registry = deps.registry ?? emptyRegistry();
    this.playerInventoryCapacity = deps.playerInventoryCapacity ?? DEFAULT_PLAYER_INVENTORY_CAPACITY;
    transport.onPeerJoin((peerId) =>
      this.peers.set(peerId, {
        lastPose: null,
        inventory: Inventory.empty(this.registry, this.playerInventoryCapacity),
        inventorySeeded: false,
      }),
    );
    transport.onPeerLeave((peerId) => {
      this.peers.delete(peerId);
      // E5.3: a disconnect mid-trade is a full rollback, same as an explicit
      // cancel — nothing was ever moved out of either inventory before the
      // atomic swap, so there's nothing to undo but the escrow record.
      this.cancelActiveTradeFor(peerId);
      transport.broadcast({ kind: "peerLeft", peerId });
      this.hooks.onPeerLeft?.(peerId);
    });
    transport.onMessage((peerId, raw) => this.handle(peerId, raw));
  }

  /** Announce shutdown to every joiner and release the transport. */
  close(): void {
    this.transport.broadcast({ kind: "hostClosing" });
    this.transport.close();
  }

  private handle(peerId: string, raw: unknown): void {
    const parsed = parseMessage(raw);
    if (isErr(parsed)) {
      console.warn("net: dropped malformed message", { peerId, reason: parsed.error.reason });
      return;
    }
    const msg = parsed.value;
    try {
      this.dispatch(peerId, msg);
    } catch {
      // N2 hardening (2026-07-19 SR follow-up): a hook (e.g. persist() I/O on
      // a deposit) throwing must never kill the host message loop for every
      // OTHER connected peer — drop this one message and keep serving. WHAT+
      // WHY only, never message contents/PII (err-explicit-result-handling §4).
      console.warn("net: message handler threw — dropped", { peerId, kind: msg.kind });
    }
  }

  private dispatch(peerId: string, msg: NetMessage): void {
    switch (msg.kind) {
      case "join":
        this.handleJoin(peerId, msg.playerName, msg.inventory);
        return;
      case "pose":
        this.handlePose(peerId, msg);
        return;
      case "dig":
        this.handleEdit(msg, { op: "dig", x: msg.x, y: msg.y, z: msg.z, radius: msg.radius });
        return;
      case "fill":
        this.handleEdit(msg, {
          op: "fill",
          x: msg.x,
          y: msg.y,
          z: msg.z,
          radius: msg.radius,
          materialId: msg.materialId,
        });
        return;
      case "interact":
        if (msg.action === "pickup") {
          this.handlePickup(peerId, msg.targetId);
          return;
        }
        this.hooks.onInteract?.(msg.action, msg.targetId, peerId);
        return;
      case "placeableInteract":
        this.handlePlaceableInteract(peerId, msg);
        return;
      case "inventoryOp":
        this.handleInventoryOp(peerId, msg.inventoryOp);
        return;
      case "tradeProposeIntent":
        this.handleTradePropose(peerId, msg.targetPeerId);
        return;
      case "tradeOfferIntent":
        this.handleTradeOffer(peerId, msg.tradeId, msg.offer);
        return;
      case "tradeConfirmIntent":
        this.handleTradeConfirm(peerId, msg.tradeId);
        return;
      case "tradeCancelIntent":
        this.handleTradeCancel(peerId, msg.tradeId);
        return;
      default:
        // host->joiner kinds echoed back at the host: no-op.
        return;
    }
  }

  private handleJoin(
    peerId: string,
    playerName: string,
    claimedInventory: SerializedInventoryWire | undefined,
  ): void {
    this.transport.send(peerId, { kind: "welcome", ...this.snapshot() });
    this.sendToOthers(peerId, { kind: "peerJoined", peerId, playerName });

    const peer = this.peers.get(peerId);
    if (peer) {
      // Never trust a joiner's claimed starting stack at face value: only
      // accept it if it matches the expected slot count AND every item is
      // real and in-bounds per the live registry (Inventory.fromSlots
      // revalidates fully) — anything else keeps the fresh empty inventory
      // already seeded at onPeerJoin. Applied at most ONCE per connection:
      // the joiner re-announces `join` on a timer, and a re-seedable claim
      // would let a peer rewrite its authoritative inventory at will.
      if (
        !peer.inventorySeeded &&
        claimedInventory &&
        claimedInventory.capacity === this.playerInventoryCapacity
      ) {
        const seeded = Inventory.fromSlots(this.registry, claimedInventory.slots);
        if (isOk(seeded)) peer.inventory = seeded.value;
      }
      peer.inventorySeeded = true;
      this.sendInventoryState(peerId, peer.inventory);
    }

    this.hooks.onPeerJoined?.(peerId, playerName);
  }

  private handlePose(peerId: string, msg: PoseMsg): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const now = this.clock();
    const prev = peer.lastPose;
    if (!validatePose(prev?.state ?? null, msg.state, prev ? now - prev.at : 0)) return;
    peer.lastPose = { state: msg.state, at: now };
    this.sendToOthers(peerId, { kind: "peerPose", peerId, state: msg.state });
    this.hooks.onPeerPose?.(peerId, msg.state);
  }

  /** Only broadcasts when the hook resolves a state (undefined/null = reject,
   *  e.g. a locked door or an empty chest slot — same silent-drop contract
   *  as an oversized dig). Debits/credits the SENDER's authoritative
   *  inventory around the hook call, atomically (E0.4). */
  private handlePlaceableInteract(peerId: string, msg: PlaceableInteractMsg): void {
    if (!validatePlaceableInteract(msg)) return;
    if (!remoteAllowedPlaceableAction(msg.action)) return;
    const peer = this.peers.get(peerId);
    if (!peer) return;

    if (msg.action === "depositChest") {
      if (msg.itemId === undefined || msg.count === undefined) return;
      this.tryDeposit(peerId, peer, msg.placeableId, msg.itemId, msg.count);
      return;
    }
    if (msg.action === "withdrawChest") {
      if (msg.itemId === undefined || msg.count === undefined) return;
      this.tryWithdraw(peerId, peer, msg.placeableId, msg.itemId, msg.count);
      return;
    }

    // toggleDoor / startCook / plantCrop: no inventory involvement (matches
    // solo play's precedent — Campfire.ts/Farming.ts don't debit the raw
    // ingredient/seed either). collectCook / harvestCrop grant an item whose
    // id/count the resolver computes (cook recipe output / randomized
    // harvest yield) — credit the sender's authoritative copy, never the
    // host's own.
    const outcome = this.hooks.onPlaceableInteract?.(msg.action, msg.placeableId, peerId, msg.itemId, msg.count);
    if (!outcome) return;
    if (outcome.grant) {
      const credited = peer.inventory.add(outcome.grant.itemId, outcome.grant.count);
      if (isOk(credited)) {
        peer.inventory = credited.value;
        this.sendInventoryState(peerId, peer.inventory);
      }
      // full bag: the placeable state (job collected / plot harvested)
      // still applies — matches solo play's `Inventory.add` "drop the grant,
      // keep going" contract (see GameHud.addLoot).
    }
    this.broadcastPlaceableState(msg.placeableId, outcome.state);
  }

  private handleInventoryOp(peerId: string, op: InventoryOp): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (!validateInventoryOp(op, peer.inventory.capacity)) return;

    switch (op.op) {
      case "move": {
        const r = peer.inventory.move(op.from, op.to);
        if (!isOk(r)) return;
        peer.inventory = r.value;
        this.sendInventoryState(peerId, peer.inventory);
        return;
      }
      case "split": {
        const r = peer.inventory.split(op.from, op.count);
        if (!isOk(r)) return;
        peer.inventory = r.value;
        this.sendInventoryState(peerId, peer.inventory);
        return;
      }
      case "use": {
        const slot = peer.inventory.slots[op.index];
        if (!slot) return;
        const r = peer.inventory.remove(slot.itemId, 1);
        if (!isOk(r)) return;
        peer.inventory = r.value;
        this.sendInventoryState(peerId, peer.inventory);
        return;
      }
      case "deposit":
        this.tryDeposit(peerId, peer, op.placeableId, op.itemId, op.count);
        return;
      case "withdraw":
        this.tryWithdraw(peerId, peer, op.placeableId, op.itemId, op.count);
        return;
    }
  }

  /** Debit the peer's authoritative inventory, THEN ask the placeable
   *  resolver to accept the deposit — the debit only commits if the
   *  placeable side also succeeds, so a rejected/full chest never conjures
   *  OR loses the stack. */
  private tryDeposit(
    peerId: string,
    peer: PeerRecord,
    placeableId: string,
    itemId: string,
    count: number,
  ): void {
    const debited = peer.inventory.remove(itemId, count);
    if (!isOk(debited)) return; // sender doesn't actually have it
    const outcome = this.hooks.onPlaceableInteract?.("depositChest", placeableId, peerId, itemId, count);
    if (!outcome) return; // chest rejected (full/invalid) — debit never committed
    peer.inventory = debited.value;
    this.broadcastPlaceableState(placeableId, outcome.state);
    this.sendInventoryState(peerId, peer.inventory);
  }

  /** Ask the placeable resolver to release the stack, THEN credit the peer's
   *  authoritative inventory — a full bag is compensated by re-depositing so
   *  nothing is lost OR duplicated either way. */
  private tryWithdraw(
    peerId: string,
    peer: PeerRecord,
    placeableId: string,
    itemId: string,
    count: number,
  ): void {
    const outcome = this.hooks.onPlaceableInteract?.("withdrawChest", placeableId, peerId, itemId, count);
    if (!outcome) return;
    const credited = peer.inventory.add(itemId, count);
    if (!isOk(credited)) {
      const restored = this.hooks.onPlaceableInteract?.("depositChest", placeableId, peerId, itemId, count);
      if (restored) this.broadcastPlaceableState(placeableId, restored.state);
      return;
    }
    peer.inventory = credited.value;
    this.broadcastPlaceableState(placeableId, outcome.state);
    this.sendInventoryState(peerId, peer.inventory);
  }

  /** E0.5: peek the ground item (never mutates host state), credit the
   *  sender's inventory, and only THEN remove it — a full bag leaves the
   *  drop on the ground instead of being conjured/lost. */
  private handlePickup(peerId: string, targetId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const stack = this.hooks.onGroundItemPeek?.(targetId);
    if (!stack) return;
    const credited = peer.inventory.add(stack.itemId, stack.count);
    if (!isOk(credited)) return;
    peer.inventory = credited.value;
    this.hooks.onGroundItemRemove?.(targetId);
    this.sendInventoryState(peerId, peer.inventory);
  }

  // ---- E5.3 trading ----

  private handleTradePropose(peerId: string, targetPeerId: string): void {
    if (!validateTradePropose(peerId, targetPeerId)) return;
    if (!this.peers.has(peerId) || !this.peers.has(targetPeerId)) return;
    // cozy scope: one active trade per peer — a pending trade on either side
    // silently refuses a second proposal rather than juggling several.
    if (this.activeTradeByPeer.has(peerId) || this.activeTradeByPeer.has(targetPeerId)) return;

    const id = `trade:${this.nextTradeId++}`;
    const proposed = proposeTrade(id, peerId, targetPeerId);
    if (!isOk(proposed)) return;
    this.trades.set(id, proposed.value);
    this.activeTradeByPeer.set(peerId, id);
    this.activeTradeByPeer.set(targetPeerId, id);
    this.sendTradeState(proposed.value);
  }

  private handleTradeOffer(peerId: string, tradeId: string, offer: readonly TradeStackWire[]): void {
    const trade = this.trades.get(tradeId);
    if (!trade || this.activeTradeByPeer.get(peerId) !== tradeId) return;
    const updated = setOffer(trade, peerId, offer);
    if (!isOk(updated)) return;
    this.trades.set(tradeId, updated.value);
    this.sendTradeState(updated.value);
  }

  /** A confirm is only accepted once the confirming peer's OWN offered
   *  stacks are revalidated against their REAL, live inventory right now —
   *  never trusting the claim made back at offer time (a peer could have
   *  spent/lost the item in between). Once both sides are confirmed, the
   *  swap is resolved atomically: debit both first, credit both only if
   *  BOTH debits succeed, full rollback (trade cancelled, nothing moved)
   *  otherwise — the no-dupe/no-loss contract the cozy tone requires. */
  private handleTradeConfirm(peerId: string, tradeId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade || this.activeTradeByPeer.get(peerId) !== tradeId) return;
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const myOffer = trade.offers[peerId] ?? [];
    for (const stack of myOffer) {
      if (!peer.inventory.has(stack.itemId, stack.count)) return; // can't confirm what you don't have
    }

    const confirmed = confirmTrade(trade, peerId);
    if (!isOk(confirmed)) return;
    this.trades.set(tradeId, confirmed.value);

    if (!bothConfirmed(confirmed.value)) {
      this.sendTradeState(confirmed.value);
      return;
    }
    this.resolveTrade(confirmed.value);
  }

  private resolveTrade(trade: TradeSession): void {
    const [peerAId, peerBId] = trade.peers;
    const peerA = this.peers.get(peerAId);
    const peerB = this.peers.get(peerBId);
    if (!peerA || !peerB) {
      this.failTrade(trade);
      return;
    }

    const offerA = trade.offers[peerAId] ?? [];
    const offerB = trade.offers[peerBId] ?? [];

    let debitedA = peerA.inventory;
    for (const stack of offerA) {
      const r = debitedA.remove(stack.itemId, stack.count);
      if (!isOk(r)) {
        this.failTrade(trade);
        return;
      }
      debitedA = r.value;
    }
    let debitedB = peerB.inventory;
    for (const stack of offerB) {
      const r = debitedB.remove(stack.itemId, stack.count);
      if (!isOk(r)) {
        this.failTrade(trade); // neither debit is applied to peer records — safe to abandon
        return;
      }
      debitedB = r.value;
    }

    let creditedA = debitedA;
    for (const stack of offerB) {
      const r = creditedA.add(stack.itemId, stack.count);
      if (!isOk(r)) {
        this.failTrade(trade); // rollback: debits were only ever local Result values, never committed
        return;
      }
      creditedA = r.value;
    }
    let creditedB = debitedB;
    for (const stack of offerA) {
      const r = creditedB.add(stack.itemId, stack.count);
      if (!isOk(r)) {
        this.failTrade(trade);
        return;
      }
      creditedB = r.value;
    }

    peerA.inventory = creditedA;
    peerB.inventory = creditedB;
    this.sendInventoryState(peerAId, peerA.inventory);
    this.sendInventoryState(peerBId, peerB.inventory);

    const completed = completeTrade(trade);
    const finalTrade = isOk(completed) ? completed.value : trade;
    this.trades.set(trade.id, finalTrade);
    this.activeTradeByPeer.delete(peerAId);
    this.activeTradeByPeer.delete(peerBId);
    this.sendTradeState(finalTrade);
  }

  /** Completion couldn't be validated (a stack vanished between confirm and
   *  swap, or a participant disconnected mid-resolve) — cancel outright.
   *  Nothing was ever written to either `PeerRecord.inventory` above this
   *  point, so there is nothing to undo but the escrow record itself. */
  private failTrade(trade: TradeSession): void {
    const cancelled = cancelTrade(trade);
    const finalTrade = isOk(cancelled) ? cancelled.value : trade;
    this.trades.set(trade.id, finalTrade);
    for (const p of trade.peers) this.activeTradeByPeer.delete(p);
    this.sendTradeState(finalTrade);
  }

  private handleTradeCancel(peerId: string, tradeId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade || this.activeTradeByPeer.get(peerId) !== tradeId) return;
    const cancelled = cancelTrade(trade);
    if (!isOk(cancelled)) return;
    this.trades.set(tradeId, cancelled.value);
    for (const p of trade.peers) this.activeTradeByPeer.delete(p);
    this.sendTradeState(cancelled.value);
  }

  private cancelActiveTradeFor(peerId: string): void {
    const tradeId = this.activeTradeByPeer.get(peerId);
    if (!tradeId) return;
    const trade = this.trades.get(tradeId);
    if (!trade) return;
    const cancelled = cancelTrade(trade);
    const finalTrade = isOk(cancelled) ? cancelled.value : trade;
    this.trades.set(tradeId, finalTrade);
    for (const p of trade.peers) this.activeTradeByPeer.delete(p);
    // the disconnecting peer's transport is already gone; sendTradeState
    // simply no-ops sending to a peer no longer in `this.peers`.
    this.sendTradeState(finalTrade);
  }

  /** Private — a trade offer is as private as an inventory: sent only to the
   *  two participants, never broadcast. */
  private sendTradeState(trade: TradeSession): void {
    const [peerAId, peerBId] = trade.peers;
    const msg = {
      kind: "tradeState" as const,
      tradeId: trade.id,
      peerA: peerAId,
      peerB: peerBId,
      offerA: trade.offers[peerAId] ?? [],
      offerB: trade.offers[peerBId] ?? [],
      confirmedA: trade.confirmed[peerAId] === true,
      confirmedB: trade.confirmed[peerBId] === true,
      status: trade.status,
    };
    if (this.peers.has(peerAId)) this.transport.send(peerAId, msg);
    if (this.peers.has(peerBId)) this.transport.send(peerBId, msg);
  }

  private broadcastPlaceableState(placeableId: string, state: unknown): void {
    this.transport.broadcast({ kind: "placeableState", placeableId, state });
  }

  /** Private — an inventory is never broadcast, only sent to its owner. */
  private sendInventoryState(peerId: string, inventory: Inventory): void {
    this.transport.send(peerId, {
      kind: "inventoryState",
      capacity: inventory.capacity,
      slots: inventory.slots.map((s) => (s ? { itemId: s.itemId, count: s.count } : null)),
    });
  }

  private handleEdit(msg: DigMsg | FillMsg, edit: WorldEdit): void {
    if (!validateDig(msg.x, msg.y, msg.z, msg.radius)) return;
    this.hooks.onWorldEdit(edit);
    this.transport.broadcast({ kind: "worldEdit", edit });
  }

  private sendToOthers(exceptPeerId: string, msg: unknown): void {
    for (const peerId of this.peers.keys()) {
      if (peerId !== exceptPeerId) this.transport.send(peerId, msg);
    }
  }
}
