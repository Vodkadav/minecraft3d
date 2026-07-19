/**
 * M7.4 multiplayer engine glue — the two composition entries src/main.ts wires
 * when a menu-launched world boots (mirrors SpawnFieldView's attach shape).
 *
 * attachHostNet: every menu-hosted world opens a trystero room under a room
 * code and serves HostSession authority over it: welcome snapshots from the
 * live save store, joiner intents applied to the live VoxelTerrain, remote
 * avatars for every peer, and the host's own pose/edits broadcast out.
 *
 * createJoinNet: the joiner half is split around the engine boot — the
 * transport + JoinSession come up BEFORE the engine (the welcome snapshot is
 * what the engine boots from), then attachWorld() binds the live session to
 * the booted scene (voxels, avatars, pose loop). World edits that arrive
 * during the long boot are buffered and replayed at attach.
 *
 * Echo discipline: applying a REMOTE edit to the voxels re-fires onLocalEdit;
 * a re-entrancy guard keeps that from boomeranging back onto the wire (which
 * on the joiner side would be an infinite loop, host→joiner→host→...).
 */

import type { Object3D } from "three";
import { HostSession, type WorldSnapshot } from "../game/application/HostSession";
import { JoinSession } from "../game/application/JoinSession";
import type { NetTransport } from "../game/application/ports/NetTransport";
import type { WorldSaveStore } from "../game/application/ports/WorldSaveStore";
import type { ItemRegistry } from "../game/domain/items/ItemRegistry";
import type {
  CreatureEntity,
  InventoryOp,
  SerializedInventoryWire,
  WelcomeMsg,
  WorldEdit,
} from "../game/domain/net/Protocol";
import { makeRoomCode } from "../game/domain/net/RoomCode";
import type { PlayerState } from "../game/domain/world/WorldSaveData";
import { makeTrysteroTransport } from "../game/infrastructure/net/TrysteroTransport";
import type { SpawnFieldHandle } from "../spawn/SpawnFieldView";
import type { PlaceableInteractionHandle } from "../voxel/placement/PlaceableInteractionTool";
import { RemotePlayers } from "./RemotePlayers";

/** Structural slice of VoxelTerrain the net glue needs (null until M8 boots it). */
export interface EditableVoxels {
  carveAt(x: number, y: number, z: number, radius: number): void;
  fillAt(x: number, y: number, z: number, radius: number, materialId?: number): void;
  onLocalEdit: ((edit: WorldEdit) => void) | null;
}

const POSE_INTERVAL_S = 0.1;
const SNAPSHOT_REFRESH_S = 3;
const WELCOME_TIMEOUT_MS = 30_000;

function applyEdit(voxels: EditableVoxels | null, edit: WorldEdit): void {
  if (!voxels) return;
  if (edit.op === "dig") voxels.carveAt(edit.x, edit.y, edit.z, edit.radius);
  else voxels.fillAt(edit.x, edit.y, edit.z, edit.radius, edit.materialId ?? 0);
}

// ---------------------------------------------------------------------- host

export interface HostNetDeps {
  readonly worldId: string;
  readonly seed: number;
  /** The SAME store the world saves into — welcome snapshots read from it. */
  readonly store: WorldSaveStore;
  getPose(): PlayerState;
  readonly voxels: EditableVoxels | null;
  /** The host's spawn field — streamed to joiners, joiner intents applied to it. */
  readonly spawns?: SpawnFieldHandle | null;
  /** The host's functional placeables (Workstream 8.1, S7b) — joiner
   *  placeableInteract intents resolve against it. */
  readonly placeables?: PlaceableInteractionHandle | null;
  /** The item catalogue peer inventories validate against (E0.4). */
  readonly registry?: ItemRegistry;
  readonly parent: Object3D;
  /** Test seam; defaults to the live trystero adapter. */
  readonly transportFactory?: (code: string) => NetTransport;
}

export interface HostNetHandle {
  readonly code: string;
  update(dt: number): void;
  dispose(): void;
}

export async function attachHostNet(deps: HostNetDeps): Promise<HostNetHandle> {
  // Deviation from ADR 0002 §4 (session nonce): the nonce is the world's seed,
  // so a world's invite code is STABLE across sessions — family members can
  // save the code once and rejoin any evening without re-sharing.
  const code = makeRoomCode(deps.worldId, deps.seed | 0);
  const transport = (deps.transportFactory ?? makeTrysteroTransport)(code);
  const remote = new RemotePlayers(deps.parent);

  let snapshot: WorldSnapshot = {
    seed: deps.seed,
    worldId: deps.worldId,
    name: "",
    modifiedChunks: [],
    entities: {},
  };
  const refreshSnapshot = async (): Promise<void> => {
    const loaded = await deps.store.load(deps.worldId);
    if (!loaded.ok) return; // keep serving the last good snapshot
    snapshot = {
      seed: loaded.value.seed,
      worldId: loaded.value.worldId,
      name: loaded.value.name,
      modifiedChunks: loaded.value.modifiedChunks,
      entities: loaded.value.entities,
    };
  };
  await refreshSnapshot();

  let applyingRemote = false;
  const session = new HostSession(
    transport,
    () => snapshot,
    {
      onWorldEdit: (edit) => {
        applyingRemote = true;
        try {
          applyEdit(deps.voxels, edit);
        } finally {
          applyingRemote = false;
        }
      },
      onPeerPose: (peerId, state) => {
        remote.upsert(peerId, state);
        // a peer riding a creature streams its own pose ~10 Hz already — reuse
        // it to glue the ridden creature's transform without new wire traffic
        // (ADR 0003 addendum: host echoes the rider's streamed pose).
        deps.spawns?.setPeerPose(peerId, state.position[0], state.position[2]);
      },
      onPeerLeft: (peerId) => {
        remote.remove(peerId);
        deps.spawns?.releaseRider(peerId);
      },
      onInteract: (action, targetId, peerId) => deps.spawns?.applyInteract(action, targetId, peerId),
      onPlaceableInteract: (action, placeableId, peerId, itemId, count) =>
        deps.placeables?.resolveHostIntent(action, placeableId, peerId, itemId, count),
    },
    { ...(deps.registry ? { registry: deps.registry } : {}) },
  );

  // the host's own digs reach joiners as resolved world truth
  if (deps.voxels) {
    deps.voxels.onLocalEdit = (edit) => {
      if (!applyingRemote) transport.broadcast({ kind: "worldEdit", edit });
    };
  }

  // stream the host's live spawn field to joiners (~10 Hz; ADR 0003)
  if (deps.spawns) {
    deps.spawns.onSnapshot = (entities) => transport.broadcast({ kind: "creatures", entities });
  }

  let poseAcc = 0;
  let snapAcc = 0;
  return {
    code,
    update(dt: number): void {
      poseAcc += dt;
      if (poseAcc >= POSE_INTERVAL_S) {
        poseAcc = 0;
        transport.broadcast({ kind: "peerPose", peerId: "host", state: deps.getPose() });
      }
      // the voxel save debounces (~2.5 s) — a periodic re-read keeps the next
      // joiner's welcome snapshot at most a few seconds behind the live world
      snapAcc += dt;
      if (snapAcc >= SNAPSHOT_REFRESH_S) {
        snapAcc = 0;
        void refreshSnapshot();
      }
      remote.update(dt);
    },
    dispose(): void {
      if (deps.voxels) deps.voxels.onLocalEdit = null;
      if (deps.spawns) deps.spawns.onSnapshot = null;
      remote.dispose();
      session.close();
    },
  };
}

// -------------------------------------------------------------------- joiner

export interface JoinWorldDeps {
  getPose(): PlayerState;
  readonly voxels: EditableVoxels | null;
  /** The joiner's spawn field — puppeted by the host's stream (ADR 0003). */
  readonly spawns?: SpawnFieldHandle | null;
  /** The joiner's functional placeables (Workstream 8.1, S7b) — `E` sends an
   *  intent instead of resolving locally; broadcast state reconciles it. */
  readonly placeables?: PlaceableInteractionHandle | null;
  readonly parent: Object3D;
  /** The host left — clean close OR a dropped connection (ADR 0002 §5). */
  onHostGone?(): void;
  /** The host's peer came back before the joiner gave up (transient drop). */
  onHostReturned?(): void;
  /** The host's resolved authoritative copy of THIS joiner's own inventory
   *  (E0.4) — the composition root reconciles its inventory UI from this,
   *  never mutating it locally. */
  onInventoryState?(wire: SerializedInventoryWire): void;
}

export interface JoinWorldHandle {
  update(dt: number): void;
  dispose(): void;
}

export interface JoinNetHandle {
  /** Resolves with the host's snapshot, or null on timeout / disposal. */
  waitForWelcome(timeoutMs?: number): Promise<WelcomeMsg | null>;
  /** Bind the live session to the booted engine scene (post-boot half). */
  attachWorld(deps: JoinWorldDeps): JoinWorldHandle;
  sendDig(x: number, y: number, z: number, radius: number): void;
  sendFill(x: number, y: number, z: number, radius: number, materialId: number): void;
  /** Direct manipulation of the joiner's own authoritative inventory (E0.4). */
  sendInventoryOp(op: InventoryOp): void;
  dispose(): void;
}

export interface JoinNetOptions {
  readonly playerName?: string;
  /** The joiner's own saved inventory (E0.4) — sent once at join to seed the
   *  host's authoritative copy of this peer. */
  readonly initialInventory?: SerializedInventoryWire;
  /** Test seam; defaults to the live trystero adapter. */
  readonly transportFactory?: (code: string) => NetTransport;
  /** Re-announce cadence while waiting for the host's welcome (ms). */
  readonly announceIntervalMs?: number;
}

/** Re-announce the join this often until the welcome lands (see below). */
const JOIN_ANNOUNCE_INTERVAL_MS = 1500;

export function createJoinNet(code: string, opts: JoinNetOptions = {}): JoinNetHandle {
  const playerName = opts.playerName ?? "Player";
  const transport = (opts.transportFactory ?? makeTrysteroTransport)(code.toUpperCase());

  let session: JoinSession | null = null;
  let welcome: WelcomeMsg | null = null;
  let resolveWelcome: ((msg: WelcomeMsg | null) => void) | null = null;
  const welcomed = new Promise<WelcomeMsg | null>((resolve) => {
    resolveWelcome = resolve;
  });

  // engine-boot gap: edits the host resolves while the joiner's world is
  // still building are buffered here and replayed at attachWorld
  const pendingEdits: WorldEdit[] = [];
  let world: {
    readonly voxels: EditableVoxels | null;
    readonly spawns: SpawnFieldHandle | null;
    readonly placeables: PlaceableInteractionHandle | null;
    readonly remote: RemotePlayers;
    readonly onHostGone?: () => void;
    readonly onHostReturned?: () => void;
    readonly onInventoryState?: (wire: SerializedInventoryWire) => void;
  } | null = null;
  let applyingRemote = false;
  // an inventoryState can arrive before attachWorld (right after join, while
  // the engine is still booting) — only the latest matters (full state, not
  // a delta), so buffer just one and flush it once the world attaches.
  let pendingInventoryState: SerializedInventoryWire | null = null;

  const applyRemoteEdit = (edit: WorldEdit): void => {
    if (!world) {
      pendingEdits.push(edit);
      return;
    }
    applyingRemote = true;
    try {
      applyEdit(world.voxels, edit);
    } finally {
      applyingRemote = false;
    }
  };

  const announceIntervalMs = opts.announceIntervalMs ?? JOIN_ANNOUNCE_INTERVAL_MS;
  let announceTimer: ReturnType<typeof setInterval> | null = null;
  const stopAnnouncing = (): void => {
    if (announceTimer !== null) {
      clearInterval(announceTimer);
      announceTimer = null;
    }
  };

  // the joiner's only peer is the host; its departure — whether a clean
  // hostClosing or a dropped WebRTC connection — means the host is gone
  // (ADR 0002 §5). Idempotent: the two signals can both fire on a clean exit.
  let hostGone = false;
  const onHostLost = (): void => {
    if (hostGone) return;
    hostGone = true;
    stopAnnouncing();
    if (world) world.onHostGone?.();
    else resolveWelcome?.(null); // dropped mid-boot ⇒ the join simply fails
  };

  const hooks = {
    onWelcome: (msg: WelcomeMsg): void => {
      if (welcome) return; // re-announced joins can draw duplicate welcomes
      welcome = msg;
      stopAnnouncing();
      resolveWelcome?.(msg);
    },
    onPeerPose: (peerId: string, state: PlayerState): void => world?.remote.upsert(peerId, state),
    onPeerLeft: (peerId: string): void => world?.remote.remove(peerId),
    onWorldEdit: applyRemoteEdit,
    // snapshots arriving before attachWorld are dropped — the next 10 Hz frame
    // re-sends the full active set, so there's nothing to buffer (ADR 0003).
    onCreatures: (entities: readonly CreatureEntity[]): void =>
      world?.spawns?.applySnapshot(entities),
    onHostClosing: onHostLost,
    onPlaceableState: (placeableId: string, state: unknown): void =>
      world?.placeables?.applyRemoteState(placeableId, state),
    onInventoryState: (wire: SerializedInventoryWire): void => {
      if (world?.onInventoryState) world.onInventoryState(wire);
      else pendingInventoryState = wire;
    },
  };

  // trystero peers appear seconds after joinRoom, in no particular order in a
  // mesh — announce (and re-announce) the join until the host's welcome lands
  const announceJoin = (): void => {
    if (welcome) return;
    if (session) {
      transport.broadcast({
        kind: "join",
        playerName,
        ...(opts.initialInventory ? { inventory: opts.initialInventory } : {}),
      });
    } else {
      // ctor sends the first join (carrying the initial inventory, if any)
      session = new JoinSession(transport, playerName, hooks, opts.initialInventory);
    }
  };
  transport.onPeerJoin(() => {
    // a transient drop that reconnects re-fires onPeerJoin: resume, don't re-handshake
    if (hostGone && welcome) {
      hostGone = false;
      world?.onHostReturned?.();
      return;
    }
    if (welcome) return;
    announceJoin();
    // A 2-peer session fires onPeerJoin exactly once, so a single join packet
    // dropped on the not-yet-open data channel would deadlock the handshake.
    // Re-announce on a timer until the welcome arrives (the caller's
    // waitForWelcome timeout bounds it; welcome + dispose both stop it).
    if (announceTimer === null) {
      announceTimer = setInterval(announceJoin, announceIntervalMs);
    }
  });
  transport.onPeerLeave(onHostLost);

  return {
    waitForWelcome(timeoutMs = WELCOME_TIMEOUT_MS): Promise<WelcomeMsg | null> {
      if (welcome) return Promise.resolve(welcome);
      return Promise.race([
        welcomed,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
    },

    attachWorld(deps: JoinWorldDeps): JoinWorldHandle {
      const remote = new RemotePlayers(deps.parent);
      const attached = {
        voxels: deps.voxels,
        spawns: deps.spawns ?? null,
        placeables: deps.placeables ?? null,
        remote,
        ...(deps.onHostGone ? { onHostGone: deps.onHostGone } : {}),
        ...(deps.onHostReturned ? { onHostReturned: deps.onHostReturned } : {}),
        ...(deps.onInventoryState ? { onInventoryState: deps.onInventoryState } : {}),
      };
      world = attached;
      if (deps.onInventoryState && pendingInventoryState) {
        deps.onInventoryState(pendingInventoryState);
        pendingInventoryState = null;
      }
      // joiner: no local sim; F/E/T become intents the host resolves (ADR 0003)
      if (deps.spawns) {
        deps.spawns.remote = true;
        deps.spawns.onInteractIntent = (action, targetId) =>
          session?.sendInteract(action, targetId);
      }
      // joiner: E on a placeable becomes an intent too (Workstream 8.1, S7b)
      if (deps.placeables) {
        deps.placeables.remote = true;
        deps.placeables.onInteractIntent = (action, placeableId, itemId, count) =>
          session?.sendPlaceableInteract(action, placeableId, itemId, count);
      }
      for (const edit of pendingEdits.splice(0)) applyRemoteEdit(edit);
      // the M8 DigTool applies locally (optimistic — SDF edits are
      // idempotent); the same edit rides to the host as an intent
      if (deps.voxels) {
        deps.voxels.onLocalEdit = (edit) => {
          if (applyingRemote) return;
          if (edit.op === "dig") session?.sendDig(edit.x, edit.y, edit.z, edit.radius);
          else session?.sendFill(edit.x, edit.y, edit.z, edit.radius, edit.materialId ?? 0);
        };
      }
      let poseAcc = 0;
      return {
        update(dt: number): void {
          poseAcc += dt;
          if (poseAcc >= POSE_INTERVAL_S) {
            poseAcc = 0;
            session?.sendPose(deps.getPose());
          }
          remote.update(dt);
        },
        dispose(): void {
          if (deps.voxels) deps.voxels.onLocalEdit = null;
          if (deps.spawns) deps.spawns.onInteractIntent = null;
          if (deps.placeables) deps.placeables.onInteractIntent = null;
          remote.dispose();
          world = null;
        },
      };
    },

    sendDig(x, y, z, radius): void {
      session?.sendDig(x, y, z, radius);
    },
    sendFill(x, y, z, radius, materialId): void {
      session?.sendFill(x, y, z, radius, materialId);
    },
    sendInventoryOp(op): void {
      session?.sendInventoryOp(op);
    },

    dispose(): void {
      stopAnnouncing();
      resolveWelcome?.(null);
      transport.close();
    },
  };
}
