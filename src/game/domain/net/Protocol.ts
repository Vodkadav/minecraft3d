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

export interface JoinMsg {
  readonly kind: "join";
  readonly playerName: string;
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

export type InteractAction = "attack" | "harvest" | "feed";

export interface InteractMsg {
  readonly kind: "interact";
  readonly action: InteractAction;
  readonly targetId: string;
}

export type JoinerMessage = JoinMsg | PoseMsg | DigMsg | FillMsg | InteractMsg;

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

export type HostMessage =
  | WelcomeMsg
  | PeerPoseMsg
  | WorldEditMsg
  | EntityRemovedMsg
  | PeerJoinedMsg
  | PeerLeftMsg
  | HostClosingMsg;

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

const INTERACT_ACTIONS: readonly string[] = ["attack", "harvest", "feed"];

/** Per-kind shape validators; each returns true iff the record is that message. */
const VALIDATORS: Record<string, (m: Record<string, unknown>) => boolean> = {
  join: (m) => isStr(m.playerName),
  pose: (m) => isPlayerState(m.state),
  dig: (m) => isNum(m.x) && isNum(m.y) && isNum(m.z) && isNum(m.radius),
  fill: (m) =>
    isNum(m.x) && isNum(m.y) && isNum(m.z) && isNum(m.radius) && isNum(m.materialId),
  interact: (m) =>
    isStr(m.action) && INTERACT_ACTIONS.includes(m.action) && isStr(m.targetId),
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
  peerJoined: (m) => isStr(m.peerId) && isStr(m.playerName),
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
    return err({ kind: "MalformedMessage", reason: `unknown kind: ${String(kind)}` });
  }
  if (!VALIDATORS[kind](raw)) {
    return err({ kind: "MalformedMessage", reason: `bad shape for kind: ${kind}` });
  }
  return ok(raw as unknown as NetMessage);
}
