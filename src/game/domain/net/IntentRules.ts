/**
 * Host-side intent sanity checks (ADR 0002 §6 — "client sends intent, host
 * resolves outcome"). The host never trusts a joiner's claimed movement or
 * edit: a pose that implies teleporting and a dig outside sane bounds are
 * silently dropped. These are pure predicates so the host session stays
 * trivially testable.
 */

import type {
  AimedAttackMsg,
  CastSpellMsg,
  DeployItemMsg,
  InventoryOp,
  PlaceableAction,
  PlaceableInteractMsg,
  Vec3Wire,
} from "./Protocol";
import type { PlayerState } from "../world/WorldSaveData";

/** Generous sprint+knockback ceiling; anything faster is a teleport. */
const MAX_HORIZONTAL_SPEED = 20; // m/s
/** Falling is legitimately fast; still bounded to reject vertical warps. */
const MAX_VERTICAL_SPEED = 80; // m/s
const MAX_DIG_RADIUS = 4;

function isFinitePose(p: PlayerState): boolean {
  return (
    p.position.length === 3 &&
    p.position.every(Number.isFinite) &&
    Number.isFinite(p.yaw) &&
    Number.isFinite(p.pitch)
  );
}

/**
 * Accept `next` given the last accepted pose `prev` and the elapsed time.
 * First pose (prev null) only needs to be finite. Movement with dtMs <= 0 is
 * infinite speed and rejected; standing still is always fine.
 */
export function validatePose(
  prev: PlayerState | null,
  next: PlayerState,
  dtMs: number,
): boolean {
  if (!isFinitePose(next)) return false;
  if (prev === null) return true;
  if (!Number.isFinite(dtMs)) return false;
  const dx = next.position[0] - prev.position[0];
  const dy = next.position[1] - prev.position[1];
  const dz = next.position[2] - prev.position[2];
  if (dx === 0 && dy === 0 && dz === 0) return true;
  if (dtMs <= 0) return false;
  const dtSec = dtMs / 1000;
  return (
    Math.hypot(dx, dz) <= MAX_HORIZONTAL_SPEED * dtSec &&
    Math.abs(dy) <= MAX_VERTICAL_SPEED * dtSec
  );
}

/** A dig/fill intent is sane: finite coords, radius in (0, 4]. */
export function validateDig(x: number, y: number, z: number, radius: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Number.isFinite(z) &&
    Number.isFinite(radius) &&
    radius > 0 &&
    radius <= MAX_DIG_RADIUS
  );
}

/** Generous cap on a single deposit/withdraw stack — matches the largest
 *  item maxStackSize in the registry with headroom, not a game-balance cap. */
const MAX_STACK_COUNT = 999;

/** Sanity for a placeable intent (Workstream 8.1): non-empty placeableId, and
 *  when present, a non-empty itemId and a finite positive integer count.
 *  Deeper checks (does this placeable exist, is it a chest, do you own the
 *  door) are the domain's job at the hook call site — this only rejects
 *  garbage shapes a hostile peer could send. */
export function validatePlaceableInteract(msg: PlaceableInteractMsg): boolean {
  if (msg.placeableId.length === 0) return false;
  if (msg.itemId !== undefined && msg.itemId.length === 0) return false;
  if (msg.count !== undefined) {
    if (!Number.isInteger(msg.count) || msg.count <= 0 || msg.count > MAX_STACK_COUNT) return false;
  }
  return true;
}

/**
 * Which placeable actions a REMOTE peer may perform. Until E0.4, the host
 * held no copy of a joiner's inventory, so this gate allowed only
 * inventory-free actions (`toggleDoor`) — everything else was dropped
 * (2026-07-19 security review). As of E0.4, `HostSession` holds each
 * connected peer's authoritative inventory: `depositChest` debits the
 * sender's copy before the chest accepts it, `withdrawChest`/`collectCook`/
 * `harvestCrop` credit it from the resolver's own grant (never the host's
 * own inventory), and `startCook`/`plantCrop` consume no inventory at all
 * (matching solo play — see `Campfire.ts`/`Farming.ts`). No wire intent can
 * conjure or duplicate an item, so every known placeable action is safe to
 * resolve remotely again.
 */
export function remoteAllowedPlaceableAction(action: PlaceableAction): boolean {
  void action;
  return true;
}

/**
 * Sanity for an `inventoryOp` intent (E0.4): shape was already checked by
 * `parseMessage`; this adds the domain-level bound a `Protocol` validator
 * can't know — the SENDER's actual inventory capacity. `move`/`split`/`use`
 * indices must be in range; `deposit`/`withdraw` need non-empty ids and a
 * sane count. Deeper checks (does the sender actually have the stack, does
 * the placeable exist) are `HostSession`'s job against its live state.
 */
/** A trade proposal must target someone other than yourself — `Trade.ts`'s
 *  `proposeTrade` already rejects a same-peer trade, but catching it here
 *  means `HostSession` never even allocates the escrow. */
export function validateTradePropose(senderPeerId: string, targetPeerId: string): boolean {
  return targetPeerId.length > 0 && targetPeerId !== senderPeerId;
}

/**
 * E7.0 combat contracts (plan §3.3/§6) — bounds-checking for the new aimed
 * intents. `Protocol.parseMessage` already rejected malformed shapes/units;
 * this layer adds the domain-level bound a shape check can't know: the
 * claimed origin must sit near the sender's own last-validated position
 * (reused pattern, `validatePose`'s speed gate) — a hostile peer can't claim
 * to attack/cast/deploy from across the map. Deeper checks (does the sender
 * actually have this weapon/ability equipped, is the target in range) are
 * `HostSession`'s job against its own authoritative records, not this file's.
 */
const MAX_ORIGIN_POSE_DISTANCE_M = 5;

/**
 * E7.2 security follow-up #3 (E7.0-sec review): a combat origin is only ever
 * accepted against a VALIDATED recent pose on record for the sender — a peer
 * that has never sent (or hasn't yet had accepted) a `pose` message has
 * nothing to compare its claimed origin against, so it fails closed instead
 * of trusting the claim outright. In practice every connected peer's pose
 * loop (10 Hz, M7.4) has already landed at least one accepted pose long
 * before combat is possible; this only rejects a still-booting/hostile peer
 * skipping straight to a combat intent.
 */
function originNearPose(lastPose: PlayerState | null, origin: Vec3Wire): boolean {
  if (lastPose === null) return false;
  const dx = origin[0] - lastPose.position[0];
  const dy = origin[1] - lastPose.position[1];
  const dz = origin[2] - lastPose.position[2];
  return Math.hypot(dx, dy, dz) <= MAX_ORIGIN_POSE_DISTANCE_M;
}

export function validateAimedAttack(lastPose: PlayerState | null, msg: AimedAttackMsg): boolean {
  return originNearPose(lastPose, msg.origin);
}

export function validateCastSpell(lastPose: PlayerState | null, msg: CastSpellMsg): boolean {
  return originNearPose(lastPose, msg.origin);
}

export function validateDeployItem(lastPose: PlayerState | null, msg: DeployItemMsg): boolean {
  return originNearPose(lastPose, msg.position);
}

/**
 * Token-bucket rate-limit seam (plan §6 — "typed now, enforcement can be a
 * later stream"). Pure so a combat stream can wire per-peer/per-action
 * budgets (casts/throws/deploys) straight into `HostSession` without
 * inventing its own bucket math; nothing calls this yet.
 */
export interface RateLimitState {
  readonly tokens: number;
  readonly lastRefillMs: number;
}

export interface RateLimitConfig {
  readonly capacity: number;
  readonly refillPerSecond: number;
}

export interface RateLimitOutcome {
  readonly allowed: boolean;
  readonly next: RateLimitState;
}

export function tryConsumeToken(
  state: RateLimitState,
  config: RateLimitConfig,
  nowMs: number,
): RateLimitOutcome {
  const elapsedSec = Math.max(0, (nowMs - state.lastRefillMs) / 1000);
  const refilled = Math.min(config.capacity, state.tokens + elapsedSec * config.refillPerSecond);
  if (refilled < 1) return { allowed: false, next: { tokens: refilled, lastRefillMs: nowMs } };
  return { allowed: true, next: { tokens: refilled - 1, lastRefillMs: nowMs } };
}

/**
 * E7.2 security follow-up #1 (E7.0-sec review): the token-bucket seam above
 * was scaffolded but unwired — `HostSession` now consumes a token per
 * `aimedAttack` against this config. Generous over any legitimate draw-fire
 * cadence (the fastest starter ranged weapon's `attackSpeed` is 1.5/s) but
 * bounded so a hostile peer can't flood launch intents.
 */
export const AIMED_ATTACK_RATE_LIMIT: RateLimitConfig = { capacity: 6, refillPerSecond: 4 };

/**
 * E7.2 security follow-up #2 (E7.0-sec review): a DoS bound on live
 * projectiles per peer, mirroring the `MAX_WIRE_*` discipline in `Protocol`
 * — a peer at the cap has further `aimedAttack` launches dropped until an
 * existing shot expires or hits.
 */
export const MAX_ACTIVE_PROJECTILES_PER_PEER = 12;

/**
 * E7.5 security guards (mirroring E7.2's AIMED_ATTACK_RATE_LIMIT/
 * MAX_ACTIVE_PROJECTILES_PER_PEER follow-ups #1/#2 from commit one, rather
 * than shipping unwired and hardening later): a deploy is a much heavier-
 * weight action than a shot (consumes a whole item, arms a lingering blast),
 * so both budgets are tighter than the ranged ones.
 */
export const DEPLOY_ITEM_RATE_LIMIT: RateLimitConfig = { capacity: 4, refillPerSecond: 1 };
export const MAX_ACTIVE_DEPLOYABLES_PER_PEER = 6;

export function validateInventoryOp(op: InventoryOp, capacity: number): boolean {
  switch (op.op) {
    case "move":
      return (
        op.from >= 0 &&
        op.from < capacity &&
        op.to >= 0 &&
        op.to < capacity &&
        op.from !== op.to
      );
    case "split":
      return (
        op.from >= 0 &&
        op.from < capacity &&
        op.count > 0 &&
        op.count <= MAX_STACK_COUNT
      );
    case "use":
      return op.index >= 0 && op.index < capacity;
    case "deposit":
    case "withdraw":
      return (
        op.placeableId.length > 0 &&
        op.itemId.length > 0 &&
        op.count > 0 &&
        op.count <= MAX_STACK_COUNT
      );
  }
}
