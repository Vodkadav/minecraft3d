/**
 * Joiner side of M7 multiplayer (ADR 0002 §6): sends intents to the host and
 * treats validated host messages as world truth, surfaced through hooks the
 * composition root wires into the engine. The joiner's transport has exactly
 * one peer (the host), so intents go out via broadcast. Anything malformed off
 * the wire is dropped with a warning — the host is trusted, the wire is not.
 */

import { isErr } from "../domain/Result";
import type {
  AimedAttackMsg,
  CreatureEntity,
  EquipSlot,
  GroundItemEntity,
  InteractAction,
  InventoryOp,
  PartyActionOp,
  PartyInventoryStateMsg,
  PartyInviteMsg,
  PartyMsg,
  PlaceableAction,
  ProjectileEntity,
  SerializedInventoryWire,
  TradeStackWire,
  TradeStateMsg,
  WelcomeMsg,
  WorldEdit,
} from "../domain/net/Protocol";
import { parseMessage } from "../domain/net/Protocol";
import type { ChatChannel, ChatMessage } from "../domain/social/Chat";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { NetTransport } from "./ports/NetTransport";
import type { PartyVitalsReport } from "./HostSession";

export interface JoinSessionHooks {
  onWelcome?(snapshot: WelcomeMsg): void;
  onPeerPose?(peerId: string, state: PlayerState): void;
  onWorldEdit?(edit: WorldEdit): void;
  onEntityRemoved?(id: string): void;
  onCreatures?(entities: readonly CreatureEntity[]): void;
  /** The host's full active ground-drop set (E0.5) — same full-set-stream
   *  contract as `onCreatures`. */
  onGroundItems?(entities: readonly GroundItemEntity[]): void;
  /** The host's full active projectile set (E7.2) — same full-set-stream
   *  contract as `onCreatures`; a joiner never simulates a shot locally,
   *  only renders a cosmetic tracer from this. */
  onProjectiles?(entities: readonly ProjectileEntity[]): void;
  onPeerJoined?(peerId: string, playerName: string): void;
  onPeerLeft?(peerId: string): void;
  onHostClosing?(): void;
  /** The host's resolved outcome of a placeableInteract intent (Workstream 8.1)
   *  — a joiner NEVER mutates placeable state locally; this is the only path
   *  a joiner's UI updates from. */
  onPlaceableState?(placeableId: string, state: unknown): void;
  /** The host's resolved AUTHORITATIVE copy of THIS joiner's own inventory
   *  (E0.4) — sent after join and after any inventoryOp/inventory-touching
   *  placeableInteract. A joiner NEVER mutates its inventory locally; this
   *  is the only path its inventory UI updates from. */
  onInventoryState?(wire: SerializedInventoryWire): void;
  /** A host-resolved, already-filtered chat message (E5.5) — the ONLY path
   *  this joiner's chat UI ever receives text from; it is never mutated or
   *  displayed from anything else. NEVER logged. */
  onChatMessage?(msg: ChatMessage): void;
  /** The host's resolved trade escrow (E5.3) — sent only when THIS joiner is
   *  one of the two participants. A joiner NEVER mutates a trade locally
   *  (offer/confirm/cancel are intents); this is the only path its trade UI
   *  updates from. */
  onTradeState?(state: TradeStateMsg): void;
  /** The host's resolved party roster (E5.1) — private, "you are not in a
   *  party" is `{ partyId: null, leaderId: null, members: [] }`. */
  onParty?(msg: PartyMsg): void;
  /** Someone invited this joiner to their party (E5.2) — prompt accept/decline. */
  onPartyInvite?(msg: PartyInviteMsg): void;
  /** The host's resolved answer to a `sendPartyInventoryLookup` (E5.4). */
  onPartyInventoryState?(msg: PartyInventoryStateMsg): void;
}

export class JoinSession {
  /** Pinned at the first welcome (2026-07-19 security review): trystero rooms
   *  are a full mesh, so a hostile fellow-joiner can also broadcast host-kind
   *  messages — everything host-authoritative is dropped unless it came from
   *  the peer that welcomed us. */
  private hostPeerId: string | null = null;

  constructor(
    private readonly transport: NetTransport,
    playerName: string,
    hooks: JoinSessionHooks,
    /** The joiner's own saved inventory (E0.4), sent once at join to seed the
     *  host's authoritative copy. Omitted ⇒ the host seeds a fresh empty one
     *  (matches a brand-new player's default boot state). */
    initialInventory?: SerializedInventoryWire,
  ) {
    transport.onMessage((peerId, raw) => {
      const parsed = parseMessage(raw);
      if (isErr(parsed)) {
        console.warn("net: dropped malformed message", { peerId, reason: parsed.error.reason });
        return;
      }
      const msg = parsed.value;
      if (msg.kind === "welcome") {
        if (this.hostPeerId !== null && this.hostPeerId !== peerId) return;
        this.hostPeerId = peerId;
        hooks.onWelcome?.(msg);
        return;
      }
      // Every other kind below is host-authoritative world truth.
      if (peerId !== this.hostPeerId) return;
      switch (msg.kind) {
        case "peerPose":
          hooks.onPeerPose?.(msg.peerId, msg.state);
          return;
        case "worldEdit":
          hooks.onWorldEdit?.(msg.edit);
          return;
        case "entityRemoved":
          hooks.onEntityRemoved?.(msg.id);
          return;
        case "creatures":
          hooks.onCreatures?.(msg.entities);
          return;
        case "groundItems":
          hooks.onGroundItems?.(msg.entities);
          return;
        case "projectiles":
          hooks.onProjectiles?.(msg.entities);
          return;
        case "peerJoined":
          hooks.onPeerJoined?.(msg.peerId, msg.playerName);
          return;
        case "peerLeft":
          hooks.onPeerLeft?.(msg.peerId);
          return;
        case "hostClosing":
          hooks.onHostClosing?.();
          return;
        case "placeableState":
          hooks.onPlaceableState?.(msg.placeableId, msg.state);
          return;
        case "inventoryState":
          hooks.onInventoryState?.({ capacity: msg.capacity, slots: msg.slots });
          return;
        case "chatMessage":
          hooks.onChatMessage?.({
            senderPeerId: msg.senderPeerId,
            senderName: msg.senderName,
            text: msg.text,
            channel: msg.channel,
            timestamp: msg.timestamp,
          });
          return;
        case "tradeState":
          hooks.onTradeState?.(msg);
          return;
        case "party":
          hooks.onParty?.(msg);
          return;
        case "partyInvite":
          hooks.onPartyInvite?.(msg);
          return;
        case "partyInventoryState":
          hooks.onPartyInventoryState?.(msg);
          return;
        default:
          // Joiner-intent kinds arriving at a joiner: not ours to handle.
          return;
      }
    });
    transport.broadcast({ kind: "join", playerName, ...(initialInventory ? { inventory: initialInventory } : {}) });
  }

  sendPose(state: PlayerState): void {
    this.transport.broadcast({ kind: "pose", state });
  }

  sendDig(x: number, y: number, z: number, radius: number): void {
    this.transport.broadcast({ kind: "dig", x, y, z, radius });
  }

  sendFill(x: number, y: number, z: number, radius: number, materialId: number): void {
    this.transport.broadcast({ kind: "fill", x, y, z, radius, materialId });
  }

  sendInteract(action: InteractAction, targetId: string): void {
    this.transport.broadcast({ kind: "interact", action, targetId });
  }

  sendPlaceableInteract(
    action: PlaceableAction,
    placeableId: string,
    itemId?: string,
    count?: number,
  ): void {
    this.transport.broadcast({ kind: "placeableInteract", action, placeableId, itemId, count });
  }

  /** Direct manipulation of the SENDER's own authoritative inventory (E0.4)
   *  — move/split/use reorg the sender's own slots; deposit/withdraw target
   *  a placeable container. The host resolves it and echoes the real result
   *  via `onInventoryState`; this session never mutates anything locally. */
  sendInventoryOp(op: InventoryOp): void {
    this.transport.broadcast({ kind: "inventoryOp", inventoryOp: op });
  }

  /** A chat submission (E5.5) — carries only text + channel, never a claimed
   *  sender name; the host attaches the sender's identity from its own join
   *  record. NEVER logged (the transport itself is the only place this text
   *  leaves the process). */
  sendChat(text: string, channel: ChatChannel): void {
    this.transport.broadcast({ kind: "chat", channel, text });
  }

  /** E5.3 trading — every mutation is an intent the host resolves; this
   *  session never mutates a trade locally, only `onTradeState` does. */
  sendTradePropose(targetPeerId: string): void {
    this.transport.broadcast({ kind: "tradeProposeIntent", targetPeerId });
  }

  sendTradeOffer(tradeId: string, offer: readonly TradeStackWire[]): void {
    this.transport.broadcast({ kind: "tradeOfferIntent", tradeId, offer });
  }

  sendTradeConfirm(tradeId: string): void {
    this.transport.broadcast({ kind: "tradeConfirmIntent", tradeId });
  }

  sendTradeCancel(tradeId: string): void {
    this.transport.broadcast({ kind: "tradeCancelIntent", tradeId });
  }

  /** A party mutation (E5.1/E5.2) — invite/accept/decline/leave/kick/share-toggle. */
  sendPartyAction(action: PartyActionOp): void {
    this.transport.broadcast({ kind: "partyAction", action });
  }

  /** This joiner's own vitals + this-encounter combat tally (E5.1/E5.6) — a
   *  low-cadence report, distinct from `sendPose`. */
  sendPartyVitals(report: PartyVitalsReport): void {
    this.transport.broadcast({ kind: "partyVitals", ...report });
  }

  /** A read-only lookup of a fellow party member's inventory (E5.4). */
  sendPartyInventoryLookup(targetPeerId: string): void {
    this.transport.broadcast({ kind: "partyInventoryLookup", targetPeerId });
  }

  /** Claim an equip choice for a slot (E7.0/E7.2) — the host only records it
   *  once it resolves the item through its own weapon registry. */
  sendEquipItem(slot: EquipSlot, itemId: string): void {
    this.transport.broadcast({ kind: "equipItem", slot, itemId });
  }

  /** A ranged/melee/spell aim (E7.2 draw-to-charge for ranged) — origin/dir/
   *  weaponSlot/chargeMs only; the host computes the actual damage/hit from
   *  its own equipped-weapon record (ADR 0004 §2, security item 5). */
  sendAimedAttack(origin: AimedAttackMsg["origin"], dir: AimedAttackMsg["dir"], weaponSlot: EquipSlot, chargeMs?: number): void {
    this.transport.broadcast({
      kind: "aimedAttack",
      origin,
      dir,
      weaponSlot,
      ...(chargeMs !== undefined ? { chargeMs } : {}),
    });
  }
}
