/**
 * The multiplayer wire model (ADR 0002). Plain structured-cloneable data —
 * discriminated unions on `kind` — so messages cross a WebRTC data channel
 * unchanged. Joiners send *intents*; only the host sends world truth (§6).
 *
 * `parseMessage` is the trust boundary: anything arriving off the wire is
 * `unknown` until its shape is verified, and a malformed message is a Result
 * error value, never a throw — a hostile peer must not crash the host.
 */

import { err, ok, type Result } from "../Result";
import { CHAT_MAX_LENGTH, isChatChannel, type ChatChannel } from "../social/Chat";
import { PARTY_MAX_SIZE } from "../social/Party";
import type { ChunkDelta, PlayerState } from "../world/WorldSaveData";

// ---- Joiner → Host intents ----

/** A stack on the wire — the same shape as domain `ItemStack`, but Protocol
 *  stays decoupled from the inventory module (parity with `PlayerState`
 *  living in `world/WorldSaveData`, not here). */
export interface InventoryStackWire {
  readonly itemId: string;
  readonly count: number;
}

/** A whole inventory on the wire (E0.4) — capacity + one slot per index. */
export interface SerializedInventoryWire {
  readonly capacity: number;
  readonly slots: readonly (InventoryStackWire | null)[];
}

export interface JoinMsg {
  readonly kind: "join";
  readonly playerName: string;
  /** The joiner's own saved inventory (E0.4) — seeds the host's authoritative
   *  copy of THIS peer. Omitted or malformed ⇒ the host seeds a fresh empty
   *  inventory (a brand-new player's default boot state); a claimed item the
   *  registry doesn't know is never trusted at face value (IntentRules/
   *  HostSession revalidate against the real registry, not just this shape
   *  check). */
  readonly inventory?: SerializedInventoryWire;
}

export interface PoseMsg {
  readonly kind: "pose";
  readonly state: PlayerState;
}

export interface DigMsg {
  readonly kind: "dig";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

export interface FillMsg {
  readonly kind: "fill";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly materialId: number;
}

export type InteractAction = "attack" | "harvest" | "feed" | "mount" | "dismount" | "pickup";

export interface InteractMsg {
  readonly kind: "interact";
  readonly action: InteractAction;
  readonly targetId: string;
}

/** Shared-world placeable mutations (Workstream 8.1) — chest deposit/withdraw,
 *  door toggle, campfire cook start/collect, crop plant/harvest. Every one is
 *  a joiner *intent*; the host resolves it against its own placeable state
 *  and rebroadcasts the outcome as `placeableState` (mirrors dig/fill §6). */
export type PlaceableAction =
  | "toggleDoor"
  | "depositChest"
  | "withdrawChest"
  | "startCook"
  | "collectCook"
  | "plantCrop"
  | "harvestCrop";

export interface PlaceableInteractMsg {
  readonly kind: "placeableInteract";
  readonly action: PlaceableAction;
  readonly placeableId: string;
  /** Item involved (deposit/withdraw/startCook/plantCrop item or seed id). */
  readonly itemId?: string;
  /** Stack count involved (deposit/withdraw). */
  readonly count?: number;
}

/**
 * Direct manipulation of the SENDER's own authoritative inventory (E0.4).
 * `move`/`split`/`use` need no other party — pure reorg of the peer's own
 * slots. `deposit`/`withdraw` target a placeable container (a chest today;
 * the same shape a future non-placeable container — e.g. the E4.4 account
 * bank — can reuse) and are resolved atomically against BOTH the container
 * and the sender's inventory, so a rejection on either side commits neither.
 */
export type InventoryOp =
  | { readonly op: "move"; readonly from: number; readonly to: number }
  | { readonly op: "split"; readonly from: number; readonly count: number }
  /** Removes one unit from `index` — a generic consume hook; what "using" an
   *  item DOES (heal, buff, craft) is a later slice's concern, this only
   *  keeps the authoritative inventory in sync with a future consume UI. */
  | { readonly op: "use"; readonly index: number }
  | {
      readonly op: "deposit";
      readonly placeableId: string;
      readonly itemId: string;
      readonly count: number;
    }
  | {
      readonly op: "withdraw";
      readonly placeableId: string;
      readonly itemId: string;
      readonly count: number;
    };

export interface InventoryOpMsg {
  readonly kind: "inventoryOp";
  readonly inventoryOp: InventoryOp;
}

/**
 * A chat submission (E5.5). Carries only text + channel — never a claimed
 * sender name: the host looks up the sender's playerName from its OWN
 * connection record (set once at `join`), so a peer can never spoof another
 * player's display name in chat. The host is the only party that filters
 * (kid-safe profanity/PII) and relays; this message is never trusted or
 * displayed at face value.
 */
export interface ChatMsg {
  readonly kind: "chat";
  readonly channel: ChatChannel;
  readonly text: string;
}

/** A claimed stack on the wire for a trade offer (E5.3) — same shape as
 *  `InventoryStackWire`, named separately so `Trade.ts`'s own `TradeStack`
 *  (domain) and this wire shape can evolve independently (parity with the
 *  rest of Protocol staying decoupled from its domain modules). */
export interface TradeStackWire {
  readonly itemId: string;
  readonly count: number;
}

/** Propose a trade with another connected peer — the host opens (or no-ops
 *  if either side is already trading) a new escrow and streams `tradeState`
 *  to both. No accept step: either side can `tradeCancelIntent` at any time,
 *  which serves as decline (cozy: no pressure, no timers). */
export interface TradeProposeMsg {
  readonly kind: "tradeProposeIntent";
  readonly targetPeerId: string;
}

/** Replace the sender's offered stacks in an active trade. Shape-checked
 *  here; the host revalidates against the sender's REAL inventory at
 *  confirm time, never at offer time (never trust a claimed stack). */
export interface TradeOfferMsg {
  readonly kind: "tradeOfferIntent";
  readonly tradeId: string;
  readonly offer: readonly TradeStackWire[];
}

export interface TradeConfirmMsg {
  readonly kind: "tradeConfirmIntent";
  readonly tradeId: string;
}

export interface TradeCancelMsg {
  readonly kind: "tradeCancelIntent";
  readonly tradeId: string;
}

/**
 * Party mutations (E5.1/E5.2) — every one is a joiner *intent*; the host
 * resolves it against `domain/social/Party.ts` and rebroadcasts the roster
 * (see `PartyMsg`). `invite`/`kick` are leader-only, enforced host-side.
 */
export type PartyActionOp =
  | { readonly op: "invite"; readonly targetPeerId: string }
  | { readonly op: "acceptInvite" }
  | { readonly op: "declineInvite" }
  | { readonly op: "leave" }
  | { readonly op: "kick"; readonly targetPeerId: string }
  /** Opt-in gate for E5.4's read-only inventory lookup — default OFF, a
   *  privacy choice each member makes for themself. */
  | { readonly op: "setInventoryShare"; readonly shared: boolean };

export interface PartyActionMsg {
  readonly kind: "partyAction";
  readonly action: PartyActionOp;
}

/**
 * A peer's self-reported vitals + this-encounter combat contribution (E5.1
 * frames + E5.6 meter), sent on a low, non-`pose` cadence. The host never
 * trusts these as authoritative game state (nothing is granted/debited from
 * them) — they only drive the OTHER party members' read-only HUD, so a
 * cheating peer can at most lie about its own displayed numbers, never
 * anyone else's. Reused as the E5.6 tally carrier — no separate high-rate
 * stream (plan constraint).
 */
export interface PartyVitalsMsg {
  readonly kind: "partyVitals";
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly level: number;
  readonly damageDealt: number;
  readonly dps: number;
  readonly healing: number;
  readonly kills: number;
}

/** A read-only lookup of a fellow party member's inventory (E5.4) — the host
 *  gates it on same-party membership AND the target's own opt-in share flag;
 *  a denied/invalid request gets no response at all (never a rejection
 *  message that would leak "you're in a party" to a non-member). */
export interface PartyInventoryLookupMsg {
  readonly kind: "partyInventoryLookup";
  readonly targetPeerId: string;
}

/**
 * Combat wire growth (E7.0 — plan §3.3/§6). Types/registries only land here;
 * no gameplay logic. Host stays the single source of truth: these intents
 * carry only WHAT the player did (an equip choice, an aim direction, a
 * cast/deploy target) — never a damage number or an outcome. The host
 * resolves damage from its OWN authoritative equipped-item record
 * (`equipItem`) plus its own raytrace/simulation, matching every other
 * intent in this file.
 */

/** Which equip slot an `equipItem`/`aimedAttack` targets. No equip *system*
 *  ships yet (E7.0 is contracts-only) — this is the closed vocabulary future
 *  streams equip logic will validate item kind against. */
export type EquipSlot = "weapon" | "spell";

/** The host records the sender's claimed equipped item for `slot`; deeper
 *  validation (does the sender actually own this item, is it weapon-kind)
 *  is a later stream's `HostSession` job — E7.0 only carries the shape. */
export interface EquipItemMsg {
  readonly kind: "equipItem";
  readonly slot: EquipSlot;
  readonly itemId: string;
}

/** A 3-component world-space vector on the wire — position or direction,
 *  disambiguated by field name/usage at each call site. */
export type Vec3Wire = readonly [number, number, number];

/** Melee-cone, ranged, and thrown attacks all share this shape (plan §3.3):
 *  the host raytraces/simulates from `origin`+`dir` against ITS OWN
 *  authoritative equipped-item record for `weaponSlot` — the client never
 *  claims a hit or a damage number. */
export interface AimedAttackMsg {
  readonly kind: "aimedAttack";
  readonly origin: Vec3Wire;
  readonly dir: Vec3Wire;
  readonly weaponSlot: EquipSlot;
}

/** Cast a spell (E7.3) — aimed either at a direction (projectile/cone) or a
 *  ground point (groundTarget), never both. `abilityId` is an
 *  `AbilityRegistry` id; the host resolves the spell's real cost/cooldown/
 *  effect from its own registry lookup, never a claimed value. */
export interface CastSpellMsg {
  readonly kind: "castSpell";
  readonly abilityId: string;
  readonly origin: Vec3Wire;
  readonly dir?: Vec3Wire;
  readonly groundPoint?: Vec3Wire;
}

/** Place a mine/trap/grenade (E7.5) — `deployableId` is a
 *  `DeployableRegistry` id; the host owns the resulting arm-timer/trigger
 *  state machine and streams it back via `deployables`. */
export interface DeployItemMsg {
  readonly kind: "deployItem";
  readonly deployableId: string;
  readonly position: Vec3Wire;
}

export type JoinerMessage =
  | JoinMsg
  | PoseMsg
  | DigMsg
  | FillMsg
  | InteractMsg
  | PlaceableInteractMsg
  | InventoryOpMsg
  | ChatMsg
  | TradeProposeMsg
  | TradeOfferMsg
  | TradeConfirmMsg
  | TradeCancelMsg
  | PartyActionMsg
  | PartyVitalsMsg
  | PartyInventoryLookupMsg
  | EquipItemMsg
  | AimedAttackMsg
  | CastSpellMsg
  | DeployItemMsg;

// ---- Host → Joiner ----

export interface WelcomeMsg {
  readonly kind: "welcome";
  readonly seed: number;
  readonly worldId: string;
  readonly name: string;
  readonly modifiedChunks: readonly ChunkDelta[];
  readonly entities: Readonly<Record<string, unknown>>;
}

export interface PeerPoseMsg {
  readonly kind: "peerPose";
  readonly peerId: string;
  readonly state: PlayerState;
}

/** A host-resolved world edit, rebroadcast to every joiner. */
export interface WorldEdit {
  readonly op: "dig" | "fill";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly materialId?: number;
}

export interface WorldEditMsg {
  readonly kind: "worldEdit";
  readonly edit: WorldEdit;
}

export interface EntityRemovedMsg {
  readonly kind: "entityRemoved";
  readonly id: string;
}

/** One streamed spawn-field entity (creature or node) — the host's live truth
 *  the joiner mirrors (ADR 0003). `y` is already ground-resolved by the host. */
export interface CreatureEntity {
  readonly id: string;
  readonly species: string;
  readonly kind: "creature" | "node";
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly behavior?: string;
  readonly health?: number;
  /** Playing its one-shot death clip — still streamed so joiners can mirror
   *  it before the host actually removes the entity (ADR 0003 follow-up). */
  readonly dying?: boolean;
  /** Tamed (rideable), streamed so a joiner's G-mount can gate on the host's
   *  real taming state instead of the joiner's untracked local guess. */
  readonly tamed?: boolean;
}

/** The host's full active spawn-field set, streamed ~10 Hz (ADR 0003). */
export interface CreaturesMsg {
  readonly kind: "creatures";
  readonly entities: readonly CreatureEntity[];
}

/** One streamed ground-drop loot stack (E0.5) — mirrors `CreatureEntity`'s
 *  shape/streaming contract but for dropped stacks (position only, no
 *  behavior/health/dying/tamed). `y` is already ground-resolved by the host. */
export interface GroundItemEntity {
  readonly id: string;
  readonly itemId: string;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The host's full active ground-drop set (E0.5), streamed like `creatures`. */
export interface GroundItemsMsg {
  readonly kind: "groundItems";
  readonly entities: readonly GroundItemEntity[];
}

export interface PeerJoinedMsg {
  readonly kind: "peerJoined";
  readonly peerId: string;
  readonly playerName: string;
}

export interface PeerLeftMsg {
  readonly kind: "peerLeft";
  readonly peerId: string;
}

export interface HostClosingMsg {
  readonly kind: "hostClosing";
}

/** The host's resolved placeable state, rebroadcast to every joiner after a
 *  valid `placeableInteract` (WorldEditMsg's pattern, generalized: the
 *  domain state is opaque JSON the placeable's own module (de)serializes —
 *  the protocol doesn't need to know its shape). */
export interface PlaceableStateMsg {
  readonly kind: "placeableState";
  readonly placeableId: string;
  readonly state: unknown;
}

/** The host's resolved authoritative inventory for the RECEIVING peer only
 *  (E0.4) — sent (never broadcast: an inventory is private), after any
 *  `inventoryOp`/inventory-touching `placeableInteract` that mutated it, and
 *  once right after `join` so the peer learns its real starting state. */
export interface InventoryStateMsg {
  readonly kind: "inventoryState";
  readonly capacity: number;
  readonly slots: readonly (InventoryStackWire | null)[];
}

/**
 * A host-resolved chat message, relayed to the recipients the channel
 * implies (E5.5): `say` broadcasts to every peer, `party` — until a party
 * roster exists (E5.1) — only ever reaches the sender back (fail-closed, see
 * `HostSession`). `text` is already filtered (kid-safe masked/redacted);
 * `senderName` is the host's own record of that peer, never the sender's
 * unchecked claim.
 */
export interface ChatMessageMsg {
  readonly kind: "chatMessage";
  readonly senderPeerId: string;
  readonly senderName: string;
  readonly text: string;
  readonly channel: ChatChannel;
  readonly timestamp: number;
}

/** The host's resolved trade escrow (E5.3), sent — never broadcast — to
 *  BOTH participants only (an offer is as private as an inventory). Every
 *  `tradeProposeIntent`/`tradeOfferIntent`/`tradeConfirmIntent`/
 *  `tradeCancelIntent`, plus the atomic-swap completion and a disconnect
 *  rollback, all resolve to one of these. */
export interface TradeStateMsg {
  readonly kind: "tradeState";
  readonly tradeId: string;
  readonly peerA: string;
  readonly peerB: string;
  readonly offerA: readonly TradeStackWire[];
  readonly offerB: readonly TradeStackWire[];
  readonly confirmedA: boolean;
  readonly confirmedB: boolean;
  readonly status: "negotiating" | "completed" | "cancelled";
}

/** One party member's roster row (E5.1 frames + E5.6 meter) — the host's
 *  merge of the member's last `partyVitals` report + its known display name.
 *  A member who hasn't reported yet (just accepted) reads as all-zero. */
export interface PartyMemberInfo {
  readonly peerId: string;
  readonly playerName: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly level: number;
  readonly damageDealt: number;
  readonly dps: number;
  readonly healing: number;
  readonly kills: number;
}

/** The host's resolved party roster (E5.1), sent PRIVATELY to every current
 *  member (never broadcast — membership is nobody else's business) after any
 *  mutation or vitals update. `partyId`/`leaderId` null + empty `members`
 *  means "you are not in a party" — the one message a peer's UI needs to
 *  clear its frames on `leave`/`kick`. */
export interface PartyMsg {
  readonly kind: "party";
  readonly partyId: string | null;
  readonly leaderId: string | null;
  readonly members: readonly PartyMemberInfo[];
}

/** Sent privately to an invited peer so its UI can prompt accept/decline
 *  (E5.2). */
export interface PartyInviteMsg {
  readonly kind: "partyInvite";
  readonly fromPeerId: string;
  readonly fromPlayerName: string;
}

/** The host's resolved answer to a `partyInventoryLookup` (E5.4) — sent only
 *  on success; a denied/invalid lookup gets silence, never this message. */
export interface PartyInventoryStateMsg {
  readonly kind: "partyInventoryState";
  readonly targetPeerId: string;
  readonly capacity: number;
  readonly slots: readonly (InventoryStackWire | null)[];
}

/** One streamed active projectile (E7.2) — mirrors `CreatureEntity`'s
 *  streaming contract: the host owns the whole simulation, joiners mirror it
 *  for a cosmetic tracer keyed by `projectileId` (a `ProjectileRegistry`
 *  id). `ownerId` is the firing peer's id (never trusted for damage — the
 *  host already resolved any hit before this ever streams). */
export interface ProjectileEntity {
  readonly id: string;
  readonly projectileId: string;
  readonly ownerId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly dirZ: number;
}

/** The host's full active projectile set, streamed like `creatures`. */
export interface ProjectilesMsg {
  readonly kind: "projectiles";
  readonly entities: readonly ProjectileEntity[];
}

/** One streamed armed/arming deployable (E7.5) — same streaming contract as
 *  `ProjectileEntity`. `deployableId` is a `DeployableRegistry` id;
 *  `armed` distinguishes the telegraph window from a live trigger-ready
 *  state for the joiner's VFX. */
export interface DeployableEntity {
  readonly id: string;
  readonly deployableId: string;
  readonly ownerId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly armed: boolean;
}

/** The host's full active deployable set, streamed like `creatures`. */
export interface DeployablesMsg {
  readonly kind: "deployables";
  readonly entities: readonly DeployableEntity[];
}

/** A one-shot VFX cue (AoE resolve or a telegraph marker, plan §5) so every
 *  peer plays the same boom/ring at the same place — `effectId` is an
 *  `AoeRegistry` id or a telegraph vfx id, resolved by the presentation
 *  layer, never semantically parsed here. */
export interface EffectMsg {
  readonly kind: "effect";
  readonly effectId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type HostMessage =
  | WelcomeMsg
  | PeerPoseMsg
  | WorldEditMsg
  | EntityRemovedMsg
  | CreaturesMsg
  | PeerJoinedMsg
  | PeerLeftMsg
  | HostClosingMsg
  | PlaceableStateMsg
  | InventoryStateMsg
  | GroundItemsMsg
  | ChatMessageMsg
  | TradeStateMsg
  | PartyMsg
  | PartyInviteMsg
  | PartyInventoryStateMsg
  | ProjectilesMsg
  | DeployablesMsg
  | EffectMsg;

export type NetMessage = JoinerMessage | HostMessage;

export type ProtocolError = {
  readonly kind: "MalformedMessage";
  readonly reason: string;
};

// ---- Validation ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === "number";
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isPlayerState(v: unknown): v is PlayerState {
  return (
    isRecord(v) &&
    Array.isArray(v.position) &&
    v.position.length === 3 &&
    v.position.every(isNum) &&
    isNum(v.yaw) &&
    isNum(v.pitch)
  );
}

function isChunkDelta(v: unknown): v is ChunkDelta {
  return isRecord(v) && isStr(v.key) && isNum(v.rev) && v.data instanceof Uint8Array;
}

function isWorldEdit(v: unknown): v is WorldEdit {
  if (!isRecord(v)) return false;
  if (v.op !== "dig" && v.op !== "fill") return false;
  if (!isNum(v.x) || !isNum(v.y) || !isNum(v.z) || !isNum(v.radius)) return false;
  if (v.op === "fill" && !isNum(v.materialId)) return false;
  return v.materialId === undefined || isNum(v.materialId);
}

const INTERACT_ACTIONS: readonly string[] = [
  "attack",
  "harvest",
  "feed",
  "mount",
  "dismount",
  "pickup",
];

const PLACEABLE_ACTIONS: readonly string[] = [
  "toggleDoor",
  "depositChest",
  "withdrawChest",
  "startCook",
  "collectCook",
  "plantCrop",
  "harvestCrop",
];

/** Ceilings for E0.4 inventory wire shapes — generous over real capacities
 *  (27 player / 20 chest, see GameHud.ts / PlaceableInteraction.ts) but
 *  bounded so a hostile peer can't DoS `parseMessage` with a huge payload.
 *  Deeper semantic checks (known item, real per-item stack limits) happen at
 *  `Inventory.fromSlots` against the live registry, not here. */
const MAX_WIRE_INVENTORY_SLOTS = 64;
const MAX_WIRE_ITEM_ID_LEN = 64;
const MAX_WIRE_STACK_COUNT = 999;

/** N1 hardening (2026-07-19 SR follow-up): a display name is free text a
 *  hostile peer fully controls — bound it so it can't pad every `peerJoined`
 *  rebroadcast or a UI label with megabytes of text. Generous over any real
 *  name; truncation is the caller's UI concern, this boundary only rejects. */
const MAX_PLAYER_NAME_LEN = 24;

/** N1 hardening: `unknown kind` is logged verbatim from attacker-controlled
 *  input — cap what reaches the console so a malicious `kind` payload can't
 *  pad every dropped-message warning. */
const MAX_LOGGED_KIND_LEN = 40;

function isInventoryStackWire(v: unknown): v is InventoryStackWire {
  return (
    isRecord(v) &&
    isStr(v.itemId) &&
    v.itemId.length > 0 &&
    v.itemId.length <= MAX_WIRE_ITEM_ID_LEN &&
    isNum(v.count) &&
    Number.isInteger(v.count) &&
    v.count > 0 &&
    v.count <= MAX_WIRE_STACK_COUNT
  );
}

function isInventorySlots(v: unknown): v is readonly (InventoryStackWire | null)[] {
  return (
    Array.isArray(v) &&
    v.length <= MAX_WIRE_INVENTORY_SLOTS &&
    v.every((s) => s === null || isInventoryStackWire(s))
  );
}

function isSerializedInventoryWire(v: unknown): v is SerializedInventoryWire {
  return (
    isRecord(v) &&
    isNum(v.capacity) &&
    Number.isInteger(v.capacity) &&
    v.capacity >= 0 &&
    v.capacity <= MAX_WIRE_INVENTORY_SLOTS &&
    isInventorySlots(v.slots) &&
    v.slots.length === v.capacity
  );
}

function isIndex(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v) && v >= 0;
}

function isWireCount(v: unknown): v is number {
  return isNum(v) && Number.isInteger(v) && v > 0 && v <= MAX_WIRE_STACK_COUNT;
}

function isWireItemId(v: unknown): v is string {
  return isStr(v) && v.length > 0 && v.length <= MAX_WIRE_ITEM_ID_LEN;
}

function isPlayerName(v: unknown): v is string {
  return isStr(v) && v.length <= MAX_PLAYER_NAME_LEN;
}

function isInventoryOp(v: unknown): v is InventoryOp {
  if (!isRecord(v)) return false;
  switch (v.op) {
    case "move":
      return isIndex(v.from) && isIndex(v.to);
    case "split":
      return isIndex(v.from) && isWireCount(v.count);
    case "use":
      return isIndex(v.index);
    case "deposit":
    case "withdraw":
      return isWireItemId(v.placeableId) && isWireItemId(v.itemId) && isWireCount(v.count);
    default:
      return false;
  }
}

/** Ceiling for E0.5 ground-item wire arrays — generous over any realistic
 *  active drop count but bounded so a hostile peer can't DoS `parseMessage`. */
const MAX_WIRE_GROUND_ITEMS = 256;

/** Wire-level cap for a chat submission (E5.5) — mirrors `Chat.CHAT_MAX_LENGTH`
 *  (the single source of truth); checked again here so a hostile peer can't
 *  even get an oversized payload past the parse boundary. */
const MAX_WIRE_CHAT_TEXT_LEN = CHAT_MAX_LENGTH;

function isChatText(v: unknown): v is string {
  return isStr(v) && v.length > 0 && v.length <= MAX_WIRE_CHAT_TEXT_LEN;
}

function isGroundItemEntity(v: unknown): v is GroundItemEntity {
  return (
    isRecord(v) &&
    isWireItemId(v.id) &&
    isWireItemId(v.itemId) &&
    isWireCount(v.count) &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.z)
  );
}

/** Small cap on offered stacks per side (E5.3) — mirrors `Trade.ts`'s own
 *  `MAX_TRADE_OFFER_STACKS`, kept a literal here (not imported) so `Protocol`
 *  stays decoupled from the domain module it validates for, matching every
 *  other wire cap in this file. */
const MAX_WIRE_TRADE_OFFER_STACKS = 8;
/** Generous cap on a peerId/tradeId string — bounded so a hostile peer can't
 *  pad a trade intent, never a real-world ceiling. */
const MAX_WIRE_ID_LEN = 64;

function isBoundedId(v: unknown, maxLen: number): v is string {
  return isStr(v) && v.length > 0 && v.length <= maxLen;
}

function isTradeStackWire(v: unknown): v is { itemId: string; count: number } {
  return isRecord(v) && isWireItemId(v.itemId) && isWireCount(v.count);
}

function isTradeOffer(v: unknown): v is readonly { itemId: string; count: number }[] {
  return Array.isArray(v) && v.length <= MAX_WIRE_TRADE_OFFER_STACKS && v.every(isTradeStackWire);
}

/** Trystero peer ids are short hex strings; this is a generous DoS-bound
 *  ceiling (mirrors `MAX_PLAYER_NAME_LEN`'s posture), not a real-id length. */
const MAX_WIRE_PEER_ID_LEN = 64;

/** Ceilings for E5.1/E5.6's self-reported vitals/combat-tally numbers — a
 *  hostile peer can only lie about ITS OWN displayed row (never granted/
 *  debited anywhere), so these just stop an absurd/NaN/Infinity payload from
 *  corrupting another player's HUD. */
const MAX_WIRE_VITAL = 1_000_000;
const MAX_WIRE_LEVEL = 9_999;
const MAX_WIRE_COMBAT_STAT = 10_000_000;

function isWirePeerId(v: unknown): v is string {
  return isStr(v) && v.length > 0 && v.length <= MAX_WIRE_PEER_ID_LEN;
}

function isBoundedNonNegative(v: unknown, max: number): v is number {
  return isNum(v) && Number.isFinite(v) && v >= 0 && v <= max;
}

function isPartyActionOp(v: unknown): v is PartyActionOp {
  if (!isRecord(v)) return false;
  switch (v.op) {
    case "invite":
    case "kick":
      return isWirePeerId(v.targetPeerId);
    case "acceptInvite":
    case "declineInvite":
    case "leave":
      return true;
    case "setInventoryShare":
      return typeof v.shared === "boolean";
    default:
      return false;
  }
}

function isPartyMemberInfo(v: unknown): v is PartyMemberInfo {
  return (
    isRecord(v) &&
    isWirePeerId(v.peerId) &&
    isPlayerName(v.playerName) &&
    isBoundedNonNegative(v.health, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(v.maxHealth, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(v.energy, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(v.maxEnergy, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(v.level, MAX_WIRE_LEVEL) &&
    isBoundedNonNegative(v.damageDealt, MAX_WIRE_COMBAT_STAT) &&
    isBoundedNonNegative(v.dps, MAX_WIRE_COMBAT_STAT) &&
    isBoundedNonNegative(v.healing, MAX_WIRE_COMBAT_STAT) &&
    isBoundedNonNegative(v.kills, MAX_WIRE_COMBAT_STAT)
  );
}

/** Ceilings for E7.0's combat wire arrays (plan §6 DoS bound) — generous
 *  over any realistic active count, bounded so a hostile peer can't DoS
 *  `parseMessage` with a huge payload (mirrors `MAX_WIRE_GROUND_ITEMS`). */
const MAX_WIRE_PROJECTILES = 256;
const MAX_WIRE_DEPLOYABLES = 128;

const EQUIP_SLOTS: readonly string[] = ["weapon", "spell"];

function isEquipSlot(v: unknown): v is EquipSlot {
  return isStr(v) && EQUIP_SLOTS.includes(v);
}

function isVec3(v: unknown): v is Vec3Wire {
  return Array.isArray(v) && v.length === 3 && v.every((n) => isNum(n) && Number.isFinite(n));
}

/** Tolerance around unit length — an aim direction should be normalized, but
 *  float error from client-side math shouldn't flip a legitimate aim into a
 *  rejected one. Deeper/exact re-derivation (e.g. from the sender's own pose)
 *  is `IntentRules`'/`HostSession`'s job, not this shape boundary. */
const DIR_MAGNITUDE_TOLERANCE = 0.05;

/** A direction vector: finite, each component in [-1, 1], and
 *  (approximately) unit length — rejects a hostile peer's out-of-range or
 *  degenerate claimed aim at the parse boundary. */
function isDirVec3(v: unknown): v is Vec3Wire {
  if (!isVec3(v)) return false;
  if (v.some((n) => n < -1 - 1e-6 || n > 1 + 1e-6)) return false;
  const mag = Math.hypot(v[0], v[1], v[2]);
  return mag > 1 - DIR_MAGNITUDE_TOLERANCE && mag < 1 + DIR_MAGNITUDE_TOLERANCE;
}

function isProjectileEntity(v: unknown): v is ProjectileEntity {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.projectileId) &&
    isStr(v.ownerId) &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.z) &&
    isNum(v.dirX) &&
    isNum(v.dirY) &&
    isNum(v.dirZ)
  );
}

function isDeployableEntity(v: unknown): v is DeployableEntity {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.deployableId) &&
    isStr(v.ownerId) &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.z) &&
    typeof v.armed === "boolean"
  );
}

function isCreatureEntity(v: unknown): v is CreatureEntity {
  return (
    isRecord(v) &&
    isStr(v.id) &&
    isStr(v.species) &&
    (v.kind === "creature" || v.kind === "node") &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.z) &&
    isNum(v.yaw) &&
    (v.behavior === undefined || isStr(v.behavior)) &&
    (v.health === undefined || isNum(v.health)) &&
    (v.dying === undefined || typeof v.dying === "boolean") &&
    (v.tamed === undefined || typeof v.tamed === "boolean")
  );
}

/** Per-kind shape validators; each returns true iff the record is that message. */
const VALIDATORS: Record<string, (m: Record<string, unknown>) => boolean> = {
  join: (m) =>
    isPlayerName(m.playerName) && (m.inventory === undefined || isSerializedInventoryWire(m.inventory)),
  pose: (m) => isPlayerState(m.state),
  dig: (m) => isNum(m.x) && isNum(m.y) && isNum(m.z) && isNum(m.radius),
  fill: (m) =>
    isNum(m.x) && isNum(m.y) && isNum(m.z) && isNum(m.radius) && isNum(m.materialId),
  interact: (m) =>
    isStr(m.action) && INTERACT_ACTIONS.includes(m.action) && isStr(m.targetId),
  placeableInteract: (m) =>
    isStr(m.action) &&
    PLACEABLE_ACTIONS.includes(m.action) &&
    isStr(m.placeableId) &&
    (m.itemId === undefined || isStr(m.itemId)) &&
    (m.count === undefined || isNum(m.count)),
  placeableState: (m) => isStr(m.placeableId) && "state" in m,
  inventoryOp: (m) => isInventoryOp(m.inventoryOp),
  inventoryState: (m) => isSerializedInventoryWire(m),
  tradeProposeIntent: (m) => isBoundedId(m.targetPeerId, MAX_WIRE_ID_LEN),
  tradeOfferIntent: (m) => isBoundedId(m.tradeId, MAX_WIRE_ID_LEN) && isTradeOffer(m.offer),
  tradeConfirmIntent: (m) => isBoundedId(m.tradeId, MAX_WIRE_ID_LEN),
  tradeCancelIntent: (m) => isBoundedId(m.tradeId, MAX_WIRE_ID_LEN),
  tradeState: (m) =>
    isBoundedId(m.tradeId, MAX_WIRE_ID_LEN) &&
    isBoundedId(m.peerA, MAX_WIRE_ID_LEN) &&
    isBoundedId(m.peerB, MAX_WIRE_ID_LEN) &&
    isTradeOffer(m.offerA) &&
    isTradeOffer(m.offerB) &&
    typeof m.confirmedA === "boolean" &&
    typeof m.confirmedB === "boolean" &&
    (m.status === "negotiating" || m.status === "completed" || m.status === "cancelled"),
  welcome: (m) =>
    isNum(m.seed) &&
    isStr(m.worldId) &&
    isStr(m.name) &&
    Array.isArray(m.modifiedChunks) &&
    m.modifiedChunks.every(isChunkDelta) &&
    isRecord(m.entities),
  peerPose: (m) => isStr(m.peerId) && isPlayerState(m.state),
  worldEdit: (m) => isWorldEdit(m.edit),
  entityRemoved: (m) => isStr(m.id),
  creatures: (m) => Array.isArray(m.entities) && m.entities.every(isCreatureEntity),
  groundItems: (m) =>
    Array.isArray(m.entities) &&
    m.entities.length <= MAX_WIRE_GROUND_ITEMS &&
    m.entities.every(isGroundItemEntity),
  peerJoined: (m) => isStr(m.peerId) && isPlayerName(m.playerName),
  peerLeft: (m) => isStr(m.peerId),
  hostClosing: () => true,
  chat: (m) => isChatChannel(m.channel) && isChatText(m.text),
  chatMessage: (m) =>
    isStr(m.senderPeerId) &&
    isPlayerName(m.senderName) &&
    isChatText(m.text) &&
    isChatChannel(m.channel) &&
    isNum(m.timestamp),
  partyAction: (m) => isPartyActionOp(m.action),
  partyVitals: (m) =>
    isBoundedNonNegative(m.health, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(m.maxHealth, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(m.energy, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(m.maxEnergy, MAX_WIRE_VITAL) &&
    isBoundedNonNegative(m.level, MAX_WIRE_LEVEL) &&
    isBoundedNonNegative(m.damageDealt, MAX_WIRE_COMBAT_STAT) &&
    isBoundedNonNegative(m.dps, MAX_WIRE_COMBAT_STAT) &&
    isBoundedNonNegative(m.healing, MAX_WIRE_COMBAT_STAT) &&
    isBoundedNonNegative(m.kills, MAX_WIRE_COMBAT_STAT),
  partyInventoryLookup: (m) => isWirePeerId(m.targetPeerId),
  party: (m) =>
    (m.partyId === null || isWirePeerId(m.partyId)) &&
    (m.leaderId === null || isWirePeerId(m.leaderId)) &&
    Array.isArray(m.members) &&
    m.members.length <= PARTY_MAX_SIZE &&
    m.members.every(isPartyMemberInfo),
  partyInvite: (m) => isWirePeerId(m.fromPeerId) && isPlayerName(m.fromPlayerName),
  partyInventoryState: (m) =>
    isWirePeerId(m.targetPeerId) && isSerializedInventoryWire({ capacity: m.capacity, slots: m.slots }),
  equipItem: (m) => isEquipSlot(m.slot) && isWireItemId(m.itemId),
  aimedAttack: (m) => isVec3(m.origin) && isDirVec3(m.dir) && isEquipSlot(m.weaponSlot),
  castSpell: (m) =>
    isBoundedId(m.abilityId, MAX_WIRE_ID_LEN) &&
    isVec3(m.origin) &&
    (m.dir !== undefined) !== (m.groundPoint !== undefined) &&
    (m.dir === undefined || isDirVec3(m.dir)) &&
    (m.groundPoint === undefined || isVec3(m.groundPoint)),
  deployItem: (m) => isBoundedId(m.deployableId, MAX_WIRE_ID_LEN) && isVec3(m.position),
  projectiles: (m) =>
    Array.isArray(m.entities) &&
    m.entities.length <= MAX_WIRE_PROJECTILES &&
    m.entities.every(isProjectileEntity),
  deployables: (m) =>
    Array.isArray(m.entities) &&
    m.entities.length <= MAX_WIRE_DEPLOYABLES &&
    m.entities.every(isDeployableEntity),
  effect: (m) =>
    isBoundedId(m.effectId, MAX_WIRE_ID_LEN) && isNum(m.x) && isNum(m.y) && isNum(m.z),
};

/** Validate an untrusted wire payload into a typed message, or an error value. */
export function parseMessage(raw: unknown): Result<NetMessage, ProtocolError> {
  if (!isRecord(raw)) {
    return err({ kind: "MalformedMessage", reason: "not an object" });
  }
  const kind = raw.kind;
  if (!isStr(kind) || !(kind in VALIDATORS)) {
    return err({
      kind: "MalformedMessage",
      reason: `unknown kind: ${String(kind).slice(0, MAX_LOGGED_KIND_LEN)}`,
    });
  }
  if (!VALIDATORS[kind](raw)) {
    return err({ kind: "MalformedMessage", reason: `bad shape for kind: ${kind}` });
  }
  return ok(raw as unknown as NetMessage);
}
