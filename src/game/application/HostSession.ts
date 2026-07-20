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
} from "../domain/net/IntentRules";
import {
  parseMessage,
  type DigMsg,
  type FillMsg,
  type InteractAction,
  type InventoryOp,
  type InventoryStackWire,
  type NetMessage,
  type PartyActionOp,
  type PartyInventoryStateMsg,
  type PartyInviteMsg,
  type PartyMemberInfo,
  type PartyMsg,
  type PlaceableAction,
  type PlaceableInteractMsg,
  type PoseMsg,
  type SerializedInventoryWire,
  type WorldEdit,
} from "../domain/net/Protocol";
import {
  acceptInvite as partyAccept,
  createParty,
  declineInvite as partyDecline,
  invite as partyInviteFn,
  kick as partyKick,
  leave as partyLeave,
  type PartyState,
} from "../domain/social/Party";
import type { ChunkDelta, PlayerState } from "../domain/world/WorldSaveData";
import type { NetTransport } from "./ports/NetTransport";

/** The host's own well-known "peer" id (E5.1) — lets the host play a full
 *  party member (invite/kick/frames/meter) without being a real transport
 *  peer. Matches the literal `NetSync.ts` already uses for the host's own
 *  broadcast pose. */
export const HOST_PEER_ID = "host";

/** A peer's self-reported vitals + this-encounter combat tally (E5.1/E5.6) —
 *  the wire shape minus its `kind` discriminant. */
export type PartyVitalsReport = {
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly level: number;
  readonly damageDealt: number;
  readonly dps: number;
  readonly healing: number;
  readonly kills: number;
};

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
  /** A party message ADDRESSED TO THE HOST ITSELF (E5.1/E5.2/E5.4) — the host
   *  is `HOST_PEER_ID`, not a real transport peer, so it can't receive a
   *  `transport.send`; this hook is the local-delivery path the composition
   *  root's own party UI reads from instead. */
  onHostPartyMessage?(msg: PartyMsg | PartyInviteMsg | PartyInventoryStateMsg): void;
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
  /** The display name this peer joined with (E5.1 party rosters). */
  playerName: string;
  /** Opt-in gate for E5.4's read-only party inventory lookup — default OFF. */
  inventoryShared: boolean;
  /** Last self-reported vitals/combat tally (E5.1/E5.6), or null before the
   *  first `partyVitals` report. */
  vitals: PartyVitalsReport | null;
}

export class HostSession {
  private readonly peers = new Map<string, PeerRecord>();
  private readonly clock: () => number;
  private readonly registry: ItemRegistry;
  private readonly playerInventoryCapacity: number;

  // ---- E5.1/E5.2 party state ----
  private readonly parties = new Map<string, PartyState>();
  private readonly partyIdByPeer = new Map<string, string>();
  /** A peer can hold at most one pending invite at a time — a second invite
   *  while one is pending simply replaces it (last-invite-wins; a deliberate
   *  cozy-scale simplification, not a security boundary). */
  private readonly invitedTo = new Map<string, string>();
  private nextPartyId = 1;
  /** The host's own party-member bookkeeping (it's never a real transport
   *  peer, so it isn't in `this.peers`) — see `HOST_PEER_ID`. */
  private hostPlayerName = "";
  private hostVitals: PartyVitalsReport | null = null;

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
        playerName: "",
        inventoryShared: false,
        vitals: null,
      }),
    );
    transport.onPeerLeave((peerId) => {
      this.peers.delete(peerId);
      transport.broadcast({ kind: "peerLeft", peerId });
      this.removeFromParty(peerId);
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
      case "partyAction":
        this.applyPartyAction(peerId, msg.action);
        return;
      case "partyVitals":
        this.handlePartyVitals(peerId, {
          health: msg.health,
          maxHealth: msg.maxHealth,
          energy: msg.energy,
          maxEnergy: msg.maxEnergy,
          level: msg.level,
          damageDealt: msg.damageDealt,
          dps: msg.dps,
          healing: msg.healing,
          kills: msg.kills,
        });
        return;
      case "partyInventoryLookup":
        this.handlePartyInventoryLookup(peerId, msg.targetPeerId);
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
      peer.playerName = playerName;
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

  // ---- E5.1/E5.2/E5.4/E5.6: party ----

  /** True for a real connected peer OR the host itself — the only ids a
   *  party mutation may reference (never invite/kick a ghost id). */
  private isKnownParticipant(peerId: string): boolean {
    return peerId === HOST_PEER_ID || this.peers.has(peerId);
  }

  private partyMemberName(peerId: string): string {
    if (peerId === HOST_PEER_ID) return this.hostPlayerName;
    return this.peers.get(peerId)?.playerName ?? "";
  }

  private partyMemberVitals(peerId: string): PartyVitalsReport | null {
    if (peerId === HOST_PEER_ID) return this.hostVitals;
    return this.peers.get(peerId)?.vitals ?? null;
  }

  /** Deliver a party message to a member — the host isn't a transport peer,
   *  so its own messages route through the local hook instead of the wire. */
  private sendPartyMessageTo(
    peerId: string,
    msg: PartyMsg | PartyInviteMsg | PartyInventoryStateMsg,
  ): void {
    if (peerId === HOST_PEER_ID) {
      this.hooks.onHostPartyMessage?.(msg);
      return;
    }
    this.transport.send(peerId, msg);
  }

  private buildRoster(partyId: string): readonly PartyMemberInfo[] {
    const party = this.parties.get(partyId);
    if (!party) return [];
    return party.memberIds.map((peerId): PartyMemberInfo => {
      const v = this.partyMemberVitals(peerId);
      return {
        peerId,
        playerName: this.partyMemberName(peerId),
        health: v?.health ?? 0,
        maxHealth: v?.maxHealth ?? 0,
        energy: v?.energy ?? 0,
        maxEnergy: v?.maxEnergy ?? 0,
        level: v?.level ?? 0,
        damageDealt: v?.damageDealt ?? 0,
        dps: v?.dps ?? 0,
        healing: v?.healing ?? 0,
        kills: v?.kills ?? 0,
      };
    });
  }

  /** Push the current roster to every current member of a party. */
  private broadcastRoster(partyId: string): void {
    const party = this.parties.get(partyId);
    if (!party) return;
    const members = this.buildRoster(partyId);
    const msg: PartyMsg = { kind: "party", partyId: party.id, leaderId: party.leaderId, members };
    for (const memberId of party.memberIds) this.sendPartyMessageTo(memberId, msg);
  }

  /** Tell a peer it is no longer in any party (left/kicked/disbanded) — the
   *  one signal its UI needs to clear the frames. */
  private sendNoParty(peerId: string): void {
    this.sendPartyMessageTo(peerId, { kind: "party", partyId: null, leaderId: null, members: [] });
  }

  private removeFromParty(peerId: string): void {
    const partyId = this.partyIdByPeer.get(peerId);
    this.invitedTo.delete(peerId);
    if (!partyId) return;
    const party = this.parties.get(partyId);
    if (!party) return;
    const result = partyLeave(party, peerId);
    if (!isOk(result)) return;
    this.partyIdByPeer.delete(peerId);
    if (result.value === null) {
      this.parties.delete(partyId);
      return;
    }
    this.parties.set(partyId, result.value);
    this.broadcastRoster(partyId);
  }

  /** Resolve a validated party intent from `actorPeerId` (a real peer, or
   *  `HOST_PEER_ID` for the host's own local UI — see `applyHostPartyAction`).
   *  Every branch drops silently on a business-rule rejection (unknown
   *  target, not-leader, party-full, ...) — same posture as every other
   *  intent in this file; a hostile/confused peer never crashes the host. */
  private applyPartyAction(actorPeerId: string, action: PartyActionOp): void {
    switch (action.op) {
      case "invite": {
        if (!this.isKnownParticipant(action.targetPeerId)) return;
        const existingId = this.partyIdByPeer.get(actorPeerId);
        const party = existingId
          ? this.parties.get(existingId)
          : createParty(`party-${this.nextPartyId++}`, actorPeerId);
        if (!party) return;
        if (this.partyIdByPeer.get(action.targetPeerId) === party.id) return; // already a member
        if (
          this.partyIdByPeer.has(action.targetPeerId) &&
          this.partyIdByPeer.get(action.targetPeerId) !== party.id
        ) {
          return; // already in a different party
        }
        const result = partyInviteFn(party, actorPeerId, action.targetPeerId);
        if (isErr(result)) return;
        this.parties.set(party.id, result.value);
        if (!existingId) this.partyIdByPeer.set(actorPeerId, party.id);
        this.invitedTo.set(action.targetPeerId, party.id);
        this.sendPartyMessageTo(action.targetPeerId, {
          kind: "partyInvite",
          fromPeerId: actorPeerId,
          fromPlayerName: this.partyMemberName(actorPeerId),
        });
        return;
      }
      case "acceptInvite": {
        const partyId = this.invitedTo.get(actorPeerId);
        if (!partyId) return;
        const party = this.parties.get(partyId);
        if (!party) return;
        const result = partyAccept(party, actorPeerId);
        if (isErr(result)) return;
        this.parties.set(partyId, result.value);
        this.partyIdByPeer.set(actorPeerId, partyId);
        this.invitedTo.delete(actorPeerId);
        this.broadcastRoster(partyId);
        return;
      }
      case "declineInvite": {
        const partyId = this.invitedTo.get(actorPeerId);
        if (!partyId) return;
        const party = this.parties.get(partyId);
        if (!party) return;
        const result = partyDecline(party, actorPeerId);
        if (isErr(result)) return;
        this.parties.set(partyId, result.value);
        this.invitedTo.delete(actorPeerId);
        return;
      }
      case "leave": {
        const partyId = this.partyIdByPeer.get(actorPeerId);
        if (!partyId) return;
        const party = this.parties.get(partyId);
        if (!party) return;
        const result = partyLeave(party, actorPeerId);
        if (isErr(result)) return;
        this.partyIdByPeer.delete(actorPeerId);
        this.sendNoParty(actorPeerId);
        if (result.value === null) {
          this.parties.delete(partyId);
        } else {
          this.parties.set(partyId, result.value);
          this.broadcastRoster(partyId);
        }
        return;
      }
      case "kick": {
        const partyId = this.partyIdByPeer.get(actorPeerId);
        if (!partyId) return;
        const party = this.parties.get(partyId);
        if (!party) return;
        const result = partyKick(party, actorPeerId, action.targetPeerId);
        if (isErr(result)) return;
        this.partyIdByPeer.delete(action.targetPeerId);
        this.sendNoParty(action.targetPeerId);
        if (result.value === null) {
          this.parties.delete(partyId);
        } else {
          this.parties.set(partyId, result.value);
          this.broadcastRoster(partyId);
        }
        return;
      }
      case "setInventoryShare": {
        // No-op for the host itself: HostSession never tracks the host's OWN
        // inventory (it plays through local game state, not a PeerRecord) —
        // see the same deferral note on `handlePartyInventoryLookup`.
        const peer = this.peers.get(actorPeerId);
        if (peer) peer.inventoryShared = action.shared;
        return;
      }
    }
  }

  private handlePartyVitals(peerId: string, report: PartyVitalsReport): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.vitals = report;
    const partyId = this.partyIdByPeer.get(peerId);
    if (partyId) this.broadcastRoster(partyId);
  }

  private handlePartyInventoryLookup(actorPeerId: string, targetPeerId: string): void {
    const actorPartyId = this.partyIdByPeer.get(actorPeerId);
    if (!actorPartyId) return;
    if (this.partyIdByPeer.get(targetPeerId) !== actorPartyId) return;
    // Deferred: the host's own inventory isn't tracked by HostSession (the
    // host plays through its own local game state, not a PeerRecord) — a
    // lookup targeting HOST_PEER_ID fails closed rather than serving stale
    // or fabricated data.
    if (targetPeerId === HOST_PEER_ID) return;
    const target = this.peers.get(targetPeerId);
    if (!target || !target.inventoryShared) return;
    this.sendPartyMessageTo(actorPeerId, {
      kind: "partyInventoryState",
      targetPeerId,
      capacity: target.inventory.capacity,
      slots: target.inventory.slots.map(
        (s): InventoryStackWire | null => (s ? { itemId: s.itemId, count: s.count } : null),
      ),
    });
  }

  // ---- host-local party API (the host is HOST_PEER_ID, not a wire peer) ----

  /** The host's own UI performing a party action (invite/accept/leave/kick/
   *  share-toggle) locally, without a wire round-trip. */
  applyHostPartyAction(action: PartyActionOp): void {
    this.applyPartyAction(HOST_PEER_ID, action);
  }

  /** The host's own periodic vitals/combat-tally report (mirrors what a
   *  joiner sends via `partyVitals`). */
  reportHostVitals(playerName: string, report: PartyVitalsReport): void {
    this.hostPlayerName = playerName;
    this.hostVitals = report;
    const partyId = this.partyIdByPeer.get(HOST_PEER_ID);
    if (partyId) this.broadcastRoster(partyId);
  }

  /** The host's own party-inventory-lookup request (E5.4). */
  requestHostPartyInventoryLookup(targetPeerId: string): void {
    this.handlePartyInventoryLookup(HOST_PEER_ID, targetPeerId);
  }

  /** Every currently-connected peer's display name — the host UI's invite
   *  target list (E5.2). Excludes the host itself (already known locally). */
  connectedPeerNames(): ReadonlyMap<string, string> {
    const names = new Map<string, string>();
    for (const [peerId, peer] of this.peers) names.set(peerId, peer.playerName);
    return names;
  }
}
