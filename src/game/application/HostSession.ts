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
import type { DamageType } from "../domain/items/ItemDefinition";
import {
  AIMED_ATTACK_RATE_LIMIT,
  CAST_SPELL_RATE_LIMIT,
  DEPLOY_ITEM_RATE_LIMIT,
  MAX_ACTIVE_DEPLOYABLES_PER_PEER,
  MAX_ACTIVE_PROJECTILES_PER_PEER,
  remoteAllowedPlaceableAction,
  tryConsumeToken,
  validateAimedAttack,
  validateCastSpell,
  validateDeployItem,
  validateDig,
  validateInventoryOp,
  validatePlaceableInteract,
  validatePose,
  validateTradePropose,
  type RateLimitState,
} from "../domain/net/IntentRules";
import {
  parseMessage,
  type AimedAttackMsg,
  type CastSpellMsg,
  type ChatMsg,
  type DeployableEntity,
  type DeployItemMsg,
  type DigMsg,
  type EquipSlot,
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
  type ProjectileEntity,
  type SerializedInventoryWire,
  type TradeStackWire,
  type WorldEdit,
} from "../domain/net/Protocol";
import {
  findHit,
  spawnProjectile,
  stepProjectile,
  velocityDirection,
  type ProjectileState,
} from "../domain/combat/Projectile";
import { chargeMultiplier } from "../domain/combat/RangedCharge";
import { PROJECTILE_REGISTRY } from "../domain/combat/ProjectileRegistry";
import { WEAPON_REGISTRY } from "../domain/combat/WeaponRegistry";
import { spawnDeployable, stepDeployable, type DeployableInstance } from "../domain/combat/Deployable";
import { DEPLOYABLE_REGISTRY, type DeployableSpec } from "../domain/combat/DeployableRegistry";
import { resolveAoe, type AoeTarget } from "../domain/combat/Aoe";
import { AOE_REGISTRY } from "../domain/combat/AoeRegistry";
// ---- E7.3 spellcasting ----
import { ABILITY_REGISTRY, type AbilitySpec } from "../domain/combat/AbilityRegistry";
import { resolveAoeCenter, scaleAbilityHits, type AbilityHit } from "../domain/combat/Ability";
import { canCast, spawnFocus, spendFocus, tickFocus, type FocusState } from "../domain/survival/Focus";
import { buildChatMessage, type ChatChannel, type ChatMessage } from "../domain/social/Chat";
import {
  bothConfirmed,
  cancel as cancelTrade,
  complete as completeTrade,
  confirm as confirmTrade,
  proposeTrade,
  setOffer,
  type TradeSession,
} from "../domain/social/Trade";
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

/** E7.2: one candidate target the host's projectile simulation tests each
 *  tick — the presentation layer (SpawnFieldView today) is the only party
 *  that knows live creature positions, so it's queried through a hook rather
 *  than HostSession importing anything Three.js-adjacent. */
export interface HittableEntity {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
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
  /** A resolved chat message (E5.5) the HOST itself should display locally —
   *  fired for every `say` message (the host has no wire hop to its own
   *  broadcast) and for `party` messages the host is a member of. Mirrors
   *  `onPeerPose`'s "host" self-loop convention. NEVER logged; this is the
   *  only path chat text reaches the composition root. */
  onChat?(msg: ChatMessage): void;
  /** Party roster port (E5.5 deferral — E5.1's `Party.ts` hasn't landed yet):
   *  given a sender peerId, return the OTHER party members' peerIds a
   *  `party`-channel message should reach, or `null` if no party system is
   *  wired. `HostSession` fails closed when this is unwired — a `party`
   *  message never broadcasts to everyone, it only echoes back to its own
   *  sender, since leaking an intended-private message would be a
   *  child-safety regression, not just a missing feature. */
  partyMembersOf?(senderPeerId: string): readonly string[] | null;
  /** A party message ADDRESSED TO THE HOST ITSELF (E5.1/E5.2/E5.4) — the host
   *  is `HOST_PEER_ID`, not a real transport peer, so it can't receive a
   *  `transport.send`; this hook is the local-delivery path the composition
   *  root's own party UI reads from instead. */
  onHostPartyMessage?(msg: PartyMsg | PartyInviteMsg | PartyInventoryStateMsg): void;
  /** E7.2: the live candidate targets for THIS tick's projectile collision
   *  test. Omitted ⇒ no hook wired ⇒ projectiles never register a hit (they
   *  simply fly until they expire) — a safe default, never a crash. */
  findHittableEntities?(): readonly HittableEntity[];
  /** E7.2: a host-resolved projectile hit — damage/target/type are ALL
   *  computed by the host's own simulation from its own weapon record
   *  (security item 5), never a client claim. The hook applies it against its
   *  own authoritative creature record. */
  onProjectileHit?(
    targetId: string,
    damage: number,
    damageType: DamageType,
    feelEvent: string,
    attackerId: string,
  ): void;
  /** E7.2: fired after each simulation tick with the full active projectile
   *  set — lets the HOST's own client render its local tracer view from the
   *  same source of truth that's also broadcast to joiners (mirrors
   *  `onPeerPose`'s "host sees its own truth locally too" pattern). */
  onProjectilesSnapshot?(entities: readonly ProjectileEntity[]): void;
  /** E7.5: a host-resolved deployable blast hit — damage/target/type are ALL
   *  computed by the host's own `resolveAoe` call over ITS OWN authoritative
   *  entity set (never a client-supplied/client-sized collection, ADR 0004
   *  §2/plan §6). Fired once per target caught in the blast. */
  onDeployableHit?(
    targetId: string,
    damage: number,
    damageType: DamageType,
    feelEvent: string,
    ownerId: string,
  ): void;
  /** E7.5: fired after each trigger-tick with the full active deployable set
   *  — mirrors `onProjectilesSnapshot`'s "host sees its own truth locally
   *  too" pattern. */
  onDeployablesSnapshot?(entities: readonly DeployableEntity[]): void;
  /** E7.5: a one-shot boom/telegraph VFX cue the host's own local client
   *  should also play (mirrors `onChat`'s host self-loop — the host has no
   *  wire hop to itself). Every joiner gets the same cue via the `effect`
   *  broadcast. */
  onEffect?(effectId: string, x: number, y: number, z: number): void;
  /** E7.3: a host-resolved spell AoE hit (Frost Puff/Healing Bloom/Vine
   *  Snare) — `hit.damage`/`hit.healing` are ALREADY scaled from the host's
   *  own `AbilitySpec` + `Aoe.resolveAoe` falloff (never a client claim).
   *  `hit.id` is a creature id (Frost Puff/Vine Snare, via
   *  `findHittableEntities`) or a connected peer id (Healing Bloom's
   *  self/ally heal). Applying the effect (creature damage, player heal, a
   *  future slow/root status) is a later wiring stream's job — mirrors
   *  E7.7's own deferred "main.ts wiring follow-up"; this hook only carries
   *  the host's authoritative resolved amount, never a THREE.js concern. */
  onAbilityHit?(casterId: string, hit: AbilityHit, spell: AbilitySpec): void;
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
  /** The HOST's own display name for chat (E5.5) — the host is a "player"
   *  too but has no `join` message of its own to carry a name. */
  readonly hostPlayerName?: string;
}

const DEFAULT_PLAYER_INVENTORY_CAPACITY = 27;
const DEFAULT_HOST_PLAYER_NAME = "Host";

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
  /** The host's own record of this peer's display name (set from `join`) —
   *  chat (E5.5) relays THIS and party rosters (E5.1) read it, never a
   *  per-message claim, so a peer can't spoof another player's name. */
  playerName: string;
  /** Opt-in gate for E5.4's read-only party inventory lookup — default OFF. */
  inventoryShared: boolean;
  /** Last self-reported vitals/combat tally (E5.1/E5.6), or null before the
   *  first `partyVitals` report. */
  vitals: PartyVitalsReport | null;
  /** E7.0/E7.2: the sender's claimed-and-registry-verified equipped item per
   *  slot (security item 4 — only ever set to an id `WEAPON_REGISTRY` knows). */
  equipped: Partial<Record<EquipSlot, string>>;
  /** E7.2 security follow-up #1: per-peer token bucket for `aimedAttack`. */
  aimedAttackRate: RateLimitState;
  /** E7.5: per-peer token bucket for `deployItem`, same shape/rationale. */
  deployItemRate: RateLimitState;
  /** E7.3: this peer's authoritative spellcasting resource — regenerated in
   *  `tick()`, debited in `handleCastSpell` (mirrors `aimedAttackRate`'s
   *  "the host's own record, never a client claim" posture for ammo). */
  focus: FocusState;
  /** E7.3: per-peer token bucket for `castSpell` (mirrors `aimedAttackRate`). */
  castSpellRate: RateLimitState;
}

/** E7.2: one live, host-simulated projectile. `state` steps every `tick()`;
 *  `damage`/`damageType`/`feelEvent` were resolved ONCE at launch from the
 *  host's own weapon + charge record (security item 5) and never change. */
interface HostProjectile {
  readonly id: string;
  readonly projectileId: string;
  readonly ownerId: string;
  readonly gravity: number;
  readonly lifetimeMs: number;
  readonly radius: number;
  /** Remaining pass-throughs before the projectile is removed on a hit. */
  pierces: number;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly feelEvent: string;
  state: ProjectileState;
}

/** E7.5: one live, host-simulated deployable. `instance` steps every
 *  `tick()`; `damage`/`damageType`/`feelEvent` were resolved ONCE at
 *  placement from the host's own `WEAPON_REGISTRY` record (security item 5)
 *  and never change. */
interface HostDeployable {
  readonly damage: number;
  readonly damageType: DamageType;
  readonly feelEvent: string;
  instance: DeployableInstance;
}

export class HostSession {
  private readonly peers = new Map<string, PeerRecord>();
  private readonly clock: () => number;
  private readonly registry: ItemRegistry;
  private readonly playerInventoryCapacity: number;
  /** The host's own display name — seeded from deps at construction (chat,
   *  E5.5) and refreshed by `reportHostVitals` (party rosters, E5.1). */
  private hostPlayerName: string;
  /** E5.3: at most one active (negotiating) trade per peer — cozy scope,
   *  no juggling multiple simultaneous trades. */
  private readonly trades = new Map<string, TradeSession>();
  private readonly activeTradeByPeer = new Map<string, string>();
  private nextTradeId = 1;

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
  private hostVitals: PartyVitalsReport | null = null;

  // ---- E7.2 ranged projectile simulation ----
  private readonly activeProjectiles = new Map<string, HostProjectile>();
  private nextProjectileId = 1;

  // ---- E7.5 deployable arm/trigger simulation ----
  private readonly activeDeployables = new Map<string, HostDeployable>();
  private nextDeployableId = 1;

  constructor(
    private readonly transport: NetTransport,
    private readonly snapshot: () => WorldSnapshot,
    private readonly hooks: HostSessionHooks,
    deps: HostSessionDeps = {},
  ) {
    this.clock = deps.clock ?? (() => Date.now());
    this.registry = deps.registry ?? emptyRegistry();
    this.playerInventoryCapacity = deps.playerInventoryCapacity ?? DEFAULT_PLAYER_INVENTORY_CAPACITY;
    this.hostPlayerName = deps.hostPlayerName ?? DEFAULT_HOST_PLAYER_NAME;
    transport.onPeerJoin((peerId) =>
      this.peers.set(peerId, {
        lastPose: null,
        inventory: Inventory.empty(this.registry, this.playerInventoryCapacity),
        inventorySeeded: false,
        playerName: "",
        inventoryShared: false,
        vitals: null,
        equipped: {},
        aimedAttackRate: { tokens: AIMED_ATTACK_RATE_LIMIT.capacity, lastRefillMs: this.clock() },
        deployItemRate: { tokens: DEPLOY_ITEM_RATE_LIMIT.capacity, lastRefillMs: this.clock() },
        focus: spawnFocus(),
        castSpellRate: { tokens: CAST_SPELL_RATE_LIMIT.capacity, lastRefillMs: this.clock() },
      }),
    );
    transport.onPeerLeave((peerId) => {
      this.peers.delete(peerId);
      // E5.3: a disconnect mid-trade is a full rollback, same as an explicit
      // cancel — nothing was ever moved out of either inventory before the
      // atomic swap, so there's nothing to undo but the escrow record.
      this.cancelActiveTradeFor(peerId);
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
      case "chat":
        this.handleChat(peerId, msg);
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
      case "equipItem":
        this.handleEquipItem(peerId, msg.slot, msg.itemId);
        return;
      case "aimedAttack":
        this.handleAimedAttack(peerId, msg);
        return;
      case "deployItem":
        this.handleDeployItem(peerId, msg);
        return;
      case "castSpell":
        this.handleCastSpell(peerId, msg);
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
      // Re-set on every join (the joiner re-announces on a timer) — this is
      // just a display label, not an authority boundary like the inventory
      // claim above, so re-applying it each time is harmless and keeps it
      // current if the peer's local name setting ever changes mid-session.
      peer.playerName = playerName;
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

  /** A joiner's chat submission (E5.5). The sender's name is looked up from
   *  the host's OWN peer record, never trusted from the wire message — a
   *  peer cannot spoof another player's display name. */
  private handleChat(peerId: string, msg: ChatMsg): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.resolveAndBroadcastChat(peerId, peer.playerName, msg.text, msg.channel);
  }

  /** The HOST's own chat submission — same validate/filter/relay path a
   *  joiner's intent takes, with sender identity "host" (mirrors the
   *  existing `peerPose` "host" self-broadcast convention). */
  sendHostChat(text: string, channel: ChatChannel): void {
    this.resolveAndBroadcastChat(HOST_PEER_ID, this.hostPlayerName, text, channel);
  }

  /** Validate length, filter (kid-safe profanity/PII masking), then relay to
   *  exactly the recipients the channel implies. `text`/the built message are
   *  NEVER logged anywhere in this path — a rejected submission is dropped
   *  silently, the same "drop, don't warn" contract dig/fill malformed edits
   *  already use, chosen here specifically so a child's chat content can
   *  never end up in a console/crash log. */
  private resolveAndBroadcastChat(
    senderPeerId: string,
    senderName: string,
    rawText: string,
    channel: ChatChannel,
  ): void {
    const built = buildChatMessage({
      senderPeerId,
      senderName,
      text: rawText,
      channel,
      timestamp: this.clock(),
    });
    if (!isOk(built)) return;
    const msg = built.value;
    const wire = {
      kind: "chatMessage" as const,
      senderPeerId: msg.senderPeerId,
      senderName: msg.senderName,
      text: msg.text,
      channel: msg.channel,
      timestamp: msg.timestamp,
    };

    if (channel === "say") {
      // broadcast reaches every connected peer INCLUDING the sender (a
      // joiner sees its own message echoed back, same as any other
      // broadcast state); the host has no wire hop to itself, so it always
      // gets its own local copy via `onChat`.
      this.transport.broadcast(wire);
      this.hooks.onChat?.(msg);
      return;
    }

    // party channel (E5.1+E5.5 reconciliation): membership is read LIVE from
    // the party maps (a test override can still inject via the
    // `partyMembersOf` hook), so a kicked/left peer drops out of the party
    // chat channel in the same tick the roster clears. No party ⇒ FAIL
    // CLOSED: the message reaches only its own sender, never a public
    // broadcast — leaking an intended-private message would be a
    // child-safety regression, not a convenience shortcut.
    const members = this.hooks.partyMembersOf?.(senderPeerId) ?? this.livePartyMembersOf(senderPeerId);
    if (members === null) {
      if (senderPeerId === HOST_PEER_ID) this.hooks.onChat?.(msg);
      else this.transport.send(senderPeerId, wire);
      return;
    }
    // HOST_PEER_ID is not a transport peer — its delivery is the onChat
    // self-loop below, never a wire send.
    for (const memberId of members) {
      if (memberId !== HOST_PEER_ID) this.transport.send(memberId, wire);
    }
    if (senderPeerId === HOST_PEER_ID || members.includes(HOST_PEER_ID)) {
      this.hooks.onChat?.(msg);
    }
    // a joiner sender always sees its own party line echoed back, whether or
    // not the host happens to be a member.
    if (senderPeerId !== HOST_PEER_ID) {
      this.transport.send(senderPeerId, wire);
    }
  }

  /** The OTHER members of the sender's party, read live from the party maps
   *  (E5.1) — null when the sender is in no party, which the party-channel
   *  routing above treats as fail-closed. */
  private livePartyMembersOf(senderPeerId: string): readonly string[] | null {
    const partyId = this.partyIdByPeer.get(senderPeerId);
    if (!partyId) return null;
    const party = this.parties.get(partyId);
    if (!party) return null;
    return party.memberIds.filter((id) => id !== senderPeerId);
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
    // security follow-up TF1: a finished trade leaves the map entirely —
    // keeping completed/cancelled records grew `trades` for the host's whole
    // session. Every intent handler gates on `activeTradeByPeer` first, so a
    // replayed intent for a deleted trade is a no-op, not a crash.
    this.trades.delete(trade.id);
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
    this.trades.delete(trade.id);
    for (const p of trade.peers) this.activeTradeByPeer.delete(p);
    this.sendTradeState(finalTrade);
  }

  private handleTradeCancel(peerId: string, tradeId: string): void {
    const trade = this.trades.get(tradeId);
    if (!trade || this.activeTradeByPeer.get(peerId) !== tradeId) return;
    const cancelled = cancelTrade(trade);
    if (!isOk(cancelled)) return;
    this.trades.delete(tradeId);
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
    this.trades.delete(tradeId);
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

  // ---- E7.2 ranged + ammo ----

  /** A joiner's claimed equip choice (E7.0/E7.2). Security item #4: only
   *  ever recorded when `WEAPON_REGISTRY` actually knows the item — an
   *  unknown/garbage id is dropped, never stored "optimistically". Spell-slot
   *  equips aren't this stream's scope (no `AbilityRegistry` lookup exists
   *  yet) and are dropped the same way until E7.3 wires it. */
  private handleEquipItem(peerId: string, slot: EquipSlot, itemId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (slot !== "weapon" || !WEAPON_REGISTRY.has(itemId)) return;
    peer.equipped[slot] = itemId;
  }

  /** A joiner's ranged launch (E7.2, ADR 0004 §2). Every guard below drops
   *  the intent silently on failure — never a throw, never a partial effect
   *  (matches every other intent handler in this file). See the stream's
   *  security checklist for which guard satisfies which E7.0-sec follow-up. */
  private handleAimedAttack(peerId: string, msg: AimedAttackMsg): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // security #3: null-pose gate — never trust an origin with no validated
    // recent pose on record for this sender.
    if (!validateAimedAttack(peer.lastPose?.state ?? null, msg)) return;

    // security #1: per-peer token bucket (was scaffolded, unwired until now).
    const limited = tryConsumeToken(peer.aimedAttackRate, AIMED_ATTACK_RATE_LIMIT, this.clock());
    peer.aimedAttackRate = limited.next;
    if (!limited.allowed) return;

    // This stream only resolves the "weapon" slot's RANGED weapons — melee
    // (E7.1) and spells (E7.3) share the same wire shape but are each their
    // own stream's job; anything else here is a safe no-op, not an error.
    if (msg.weaponSlot !== "weapon") return;
    const equippedId = peer.equipped.weapon;
    if (!equippedId) return;

    // security #4: resolve the claimed equip through the registry — drop on
    // Unknown* rather than trusting the sender's earlier equip claim at face
    // value a second time.
    const weaponResult = WEAPON_REGISTRY.get(equippedId);
    if (!isOk(weaponResult)) return;
    const weapon = weaponResult.value;
    if (weapon.kind !== "ranged" || !weapon.projectile) return;

    const specResult = PROJECTILE_REGISTRY.get(weapon.projectile);
    if (!isOk(specResult)) return;
    const spec = specResult.value;

    // security #2: per-peer active-projectile DoS cap.
    let activeForPeer = 0;
    for (const p of this.activeProjectiles.values()) {
      if (p.ownerId === peerId) activeForPeer++;
    }
    if (activeForPeer >= MAX_ACTIVE_PROJECTILES_PER_PEER) return;

    // security #5: ammo is debited from the host's OWN authoritative
    // inventory — a peer with no ammo simply gets no shot, never a
    // conjured/duplicated arrow.
    if (weapon.ammoItemId) {
      const debited = peer.inventory.remove(weapon.ammoItemId, 1);
      if (!isOk(debited)) return;
      peer.inventory = debited.value;
      this.sendInventoryState(peerId, peer.inventory);
    }

    // security #5 (cont'd): damage is computed from the host's OWN weapon
    // record + its own clamp of the claimed hold duration — the client never
    // names a damage number, only how long it held the draw (parsed/bounded
    // already at `Protocol.parseMessage`).
    const damage = weapon.damage * chargeMultiplier(msg.chargeMs ?? 0);

    const id = `proj:${this.nextProjectileId++}`;
    this.activeProjectiles.set(id, {
      id,
      projectileId: spec.id,
      ownerId: peerId,
      gravity: spec.gravity,
      lifetimeMs: spec.lifetimeMs,
      radius: spec.radius,
      pierces: spec.pierces ?? 0,
      damage,
      damageType: weapon.damageType,
      feelEvent: weapon.feelEvent,
      state: spawnProjectile(msg.origin, msg.dir, spec.speed),
    });
  }

  /** A joiner's mine/trap/grenade placement (E7.5, ADR 0004 §2). Every guard
   *  below drops the intent silently on failure — never a throw, never a
   *  partial effect (mirrors `handleAimedAttack`'s security checklist). */
  private handleDeployItem(peerId: string, msg: DeployItemMsg): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // security #3: null-pose gate — never trust a placement with no
    // validated recent pose on record for this sender.
    if (!validateDeployItem(peer.lastPose?.state ?? null, msg)) return;

    // security #1: per-peer token bucket.
    const limited = tryConsumeToken(peer.deployItemRate, DEPLOY_ITEM_RATE_LIMIT, this.clock());
    peer.deployItemRate = limited.next;
    if (!limited.allowed) return;

    // security #4: resolve the claimed deployableId through the registry —
    // drop on Unknown* rather than trusting the sender's claim at face value.
    const specResult = DEPLOYABLE_REGISTRY.get(msg.deployableId);
    if (!isOk(specResult)) return;
    const spec = specResult.value;

    // The deployed item's id doubles as its DeployableRegistry id
    // (starterItems.ts's E7.5 section) — resolve the SAME id's weapon
    // metadata for damage/damageType/feelEvent, never a client-claimed
    // number (security item 5, same posture as ranged's ammo/damage).
    const weaponResult = WEAPON_REGISTRY.get(msg.deployableId);
    if (!isOk(weaponResult)) return;
    const weapon = weaponResult.value;
    if (weapon.kind !== "deployable") return;

    // security #2: per-peer active-deployable DoS cap.
    let activeForPeer = 0;
    for (const d of this.activeDeployables.values()) {
      if (d.instance.ownerId === peerId) activeForPeer++;
    }
    if (activeForPeer >= MAX_ACTIVE_DEPLOYABLES_PER_PEER) return;

    // security #5: debit the deployed item from the host's OWN authoritative
    // inventory — a peer with none simply gets no placement, never a
    // conjured/duplicated mine.
    const debited = peer.inventory.remove(msg.deployableId, 1);
    if (!isOk(debited)) return;
    peer.inventory = debited.value;
    this.sendInventoryState(peerId, peer.inventory);

    const id = `deploy:${this.nextDeployableId++}`;
    this.activeDeployables.set(id, {
      damage: weapon.damage,
      damageType: weapon.damageType,
      feelEvent: weapon.feelEvent,
      instance: spawnDeployable(id, spec.id, peerId, {
        x: msg.position[0],
        y: msg.position[1],
        z: msg.position[2],
      }),
    });
  }

  // ---- E7.3 spellcasting ----

  /** A joiner's spell cast (E7.3, ADR 0004 §2/§6). Mirrors
   *  `handleAimedAttack`'s guard order exactly: null-pose origin gate,
   *  rate-limit, registry-resolve (drop on Unknown), then debit the host's
   *  OWN authoritative focus record for the sender — every branch drops the
   *  intent silently on failure, never a throw, never a partial effect. */
  private handleCastSpell(peerId: string, msg: CastSpellMsg): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // security #3 equivalent: null-pose gate — never trust an origin with no
    // validated recent pose on record for this sender.
    if (!validateCastSpell(peer.lastPose?.state ?? null, msg)) return;

    // security #1 equivalent: per-peer token bucket.
    const limited = tryConsumeToken(peer.castSpellRate, CAST_SPELL_RATE_LIMIT, this.clock());
    peer.castSpellRate = limited.next;
    if (!limited.allowed) return;

    // security #4 equivalent: resolve the claimed spell id through the
    // registry — drop on Unknown rather than trusting the wire id at face
    // value.
    const abilityResult = ABILITY_REGISTRY.get(msg.abilityId);
    if (!isOk(abilityResult)) return;
    const spell = abilityResult.value;

    // security #5 equivalent: focus is debited from the host's OWN
    // authoritative record for the sender — a peer with too little focus
    // simply gets no cast, never a conjured/free spell.
    if (!canCast(peer.focus, spell.resourceCost)) return;
    peer.focus = spendFocus(peer.focus, spell.resourceCost);

    if (spell.targeting === "projectile") {
      this.castProjectileSpell(peerId, spell, msg);
      return;
    }
    this.castAoeSpell(peerId, spell, msg);
  }

  /** Sparkle Bolt's targeting mode — reuses the SAME host-simulated
   *  projectile pool (`activeProjectiles`) and per-peer DoS cap a ranged
   *  weapon's arrow uses (security #2 equivalent): a spell shot is just
   *  another projectile from the host's point of view. */
  private castProjectileSpell(peerId: string, spell: AbilitySpec, msg: CastSpellMsg): void {
    if (!msg.dir || !spell.projectile) return;
    const specResult = PROJECTILE_REGISTRY.get(spell.projectile);
    if (!isOk(specResult)) return;
    const spec = specResult.value;

    let activeForPeer = 0;
    for (const p of this.activeProjectiles.values()) {
      if (p.ownerId === peerId) activeForPeer++;
    }
    if (activeForPeer >= MAX_ACTIVE_PROJECTILES_PER_PEER) return;

    const id = `proj:${this.nextProjectileId++}`;
    this.activeProjectiles.set(id, {
      id,
      projectileId: spec.id,
      ownerId: peerId,
      gravity: spec.gravity,
      lifetimeMs: spec.lifetimeMs,
      radius: spec.radius,
      pierces: spec.pierces ?? 0,
      damage: spell.damage ?? 0,
      damageType: spell.damageType,
      feelEvent: spell.feelEvent,
      state: spawnProjectile(msg.origin, msg.dir, spec.speed),
    });
  }

  /** Frost Puff / Healing Bloom / Vine Snare's targeting modes — resolved
   *  instantly (no persistent network entity, unlike a projectile) via
   *  `Aoe.resolveAoe` against ONLY the host's own authoritative entity set
   *  (security #5's target-list equivalent): `selfAoe` (Healing Bloom)
   *  resolves against the host's own connected-peer roster
   *  (`connectedPeerTargets`, never a claimed target list); `cone`/
   *  `groundTarget` resolve against the same `findHittableEntities` creature
   *  set a ranged shot's hit test uses. Every peer sees the same VFX via one
   *  `effect` broadcast (mirrors `AoeField`'s bomb-boom contract). */
  private castAoeSpell(peerId: string, spell: AbilitySpec, msg: CastSpellMsg): void {
    if (!spell.aoe) return;
    const aoeResult = AOE_REGISTRY.get(spell.aoe);
    if (!isOk(aoeResult)) return;
    const aoeSpec = aoeResult.value;

    const centerResult = resolveAoeCenter(
      { targeting: spell.targeting, origin: msg.origin, dir: msg.dir, groundPoint: msg.groundPoint },
      aoeSpec,
    );
    if (!isOk(centerResult)) return;
    const [cx, cy, cz] = centerResult.value;

    const targets: readonly AoeTarget[] =
      spell.targeting === "selfAoe" ? this.connectedPeerTargets() : (this.hooks.findHittableEntities?.() ?? []);
    const resolved = resolveAoe(aoeSpec, { x: cx, y: cy, z: cz }, targets);
    if (!isOk(resolved)) return;

    for (const hit of scaleAbilityHits(spell, resolved.value)) {
      this.hooks.onAbilityHit?.(peerId, hit, spell);
    }
    this.transport.broadcast({ kind: "effect", effectId: aoeSpec.vfx, x: cx, y: cy, z: cz });
  }

  /** Every connected peer's last validated position, keyed by peerId — the
   *  candidate target set for a `selfAoe` spell (Healing Bloom's self/ally
   *  heal). A peer with no validated pose yet simply isn't a candidate
   *  (mirrors the null-pose posture used everywhere else in this file). */
  private connectedPeerTargets(): readonly AoeTarget[] {
    const targets: AoeTarget[] = [];
    for (const [id, p] of this.peers) {
      if (!p.lastPose) continue;
      const [x, y, z] = p.lastPose.state.position;
      targets.push({ id, x, y, z });
    }
    return targets;
  }

  /** Advance every live projectile AND deployable one tick, and regenerate
   *  every connected peer's focus (E7.3). Called by the composition root's
   *  frame loop (mirrors `SpawnFieldView.update`'s own per-frame stepping,
   *  just hosted here since both sims are pure/Three.js-free — see ADR 0004
   *  §3). Focus regen is cheap even when nothing is active, mirroring how
   *  `Survival.tickSurvival` runs every frame regardless of state. */
  tick(dtMs: number): void {
    const dtSec = dtMs / 1000;
    for (const peer of this.peers.values()) {
      peer.focus = tickFocus(peer.focus, dtSec);
    }
    if (this.activeProjectiles.size > 0) this.tickProjectiles(dtMs);
    if (this.activeDeployables.size > 0) this.tickDeployables(dtMs);
  }

  /** Resolve collisions against `hooks.findHittableEntities()` and stream
   *  the resulting projectile set. */
  private tickProjectiles(dtMs: number): void {
    const targets = this.hooks.findHittableEntities?.() ?? [];
    for (const [id, proj] of this.activeProjectiles) {
      const outcome = stepProjectile(proj.state, proj, dtMs);
      proj.state = outcome.state;
      const hit = targets.length > 0 ? findHit(proj.state, proj.radius, targets) : null;
      if (hit) {
        this.hooks.onProjectileHit?.(hit.id, proj.damage, proj.damageType, proj.feelEvent, proj.ownerId);
        if (proj.pierces > 0) {
          proj.pierces -= 1;
        } else {
          this.activeProjectiles.delete(id);
          continue;
        }
      }
      if (outcome.expired) this.activeProjectiles.delete(id);
    }
    this.broadcastProjectiles();
  }

  /** Advance every armed/arming deployable, resolving a trigger the instant
   *  `Deployable.stepDeployable` reports one — via the shared `resolveAoe`
   *  (E7.4) over `hooks.findHittableEntities()`'s OWN authoritative entity
   *  set (security item 6: never a client-supplied/client-sized collection),
   *  then streams the resulting set. */
  private tickDeployables(dtMs: number): void {
    const targets = this.hooks.findHittableEntities?.() ?? [];
    for (const [id, dep] of this.activeDeployables) {
      const specResult = DEPLOYABLE_REGISTRY.get(dep.instance.deployableId);
      if (!isOk(specResult)) {
        // Can't happen from a real placement (handleDeployItem already
        // resolved this id) — defensive only, never a crash on stale data.
        this.activeDeployables.delete(id);
        continue;
      }
      const spec = specResult.value;
      dep.instance = stepDeployable(dep.instance, spec, dtMs, targets);
      if (dep.instance.state === "triggered") {
        this.resolveDeployableTrigger(dep, spec, targets);
        this.activeDeployables.delete(id);
      }
    }
    this.broadcastDeployables();
  }

  /** Resolve one deployable's blast: the host's own AoE spec + its own live
   *  entity set — a joiner never supplies or influences either. Applies a
   *  hit per target via `onDeployableHit` and broadcasts the shared `effect`
   *  cue so every peer plays the same boom/pop at the same place. */
  private resolveDeployableTrigger(
    dep: HostDeployable,
    spec: DeployableSpec,
    targets: readonly HittableEntity[],
  ): void {
    const { x, y, z, ownerId } = dep.instance;
    const aoeResult = AOE_REGISTRY.get(spec.aoe);
    if (isOk(aoeResult)) {
      const aoeSpec = aoeResult.value;
      const hitsResult = resolveAoe(aoeSpec, { x, y, z }, targets);
      if (isOk(hitsResult)) {
        for (const hit of hitsResult.value) {
          this.hooks.onDeployableHit?.(hit.id, dep.damage * hit.magnitude, dep.damageType, dep.feelEvent, ownerId);
        }
      }
      this.transport.broadcast({ kind: "effect", effectId: aoeSpec.vfx, x, y, z });
      this.hooks.onEffect?.(aoeSpec.vfx, x, y, z);
    }
  }

  private broadcastDeployables(): void {
    const entities: DeployableEntity[] = [...this.activeDeployables.entries()].map(([id, d]) => ({
      id,
      deployableId: d.instance.deployableId,
      ownerId: d.instance.ownerId,
      x: d.instance.x,
      y: d.instance.y,
      z: d.instance.z,
      armed: d.instance.state === "armed",
    }));
    this.transport.broadcast({ kind: "deployables", entities });
    this.hooks.onDeployablesSnapshot?.(entities);
  }

  private broadcastProjectiles(): void {
    const entities: ProjectileEntity[] = [...this.activeProjectiles.values()].map((p) => {
      const [dirX, dirY, dirZ] = velocityDirection(p.state);
      return {
        id: p.id,
        projectileId: p.projectileId,
        ownerId: p.ownerId,
        x: p.state.x,
        y: p.state.y,
        z: p.state.z,
        dirX,
        dirY,
        dirZ,
      };
    });
    this.transport.broadcast({ kind: "projectiles", entities });
    this.hooks.onProjectilesSnapshot?.(entities);
  }
}
