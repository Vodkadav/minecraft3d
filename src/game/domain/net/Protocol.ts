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

export type InteractAction = "attack" | "harvest" | "feed" | "mount" | "dismount";

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

export type JoinerMessage =
  | JoinMsg
  | PoseMsg
  | DigMsg
  | FillMsg
  | InteractMsg
  | PlaceableInteractMsg
  | InventoryOpMsg;

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
  | InventoryStateMsg;

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

const INTERACT_ACTIONS: readonly string[] = ["attack", "harvest", "feed", "mount", "dismount"];

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
  peerJoined: (m) => isStr(m.peerId) && isPlayerName(m.playerName),
  peerLeft: (m) => isStr(m.peerId),
  hostClosing: () => true,
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
