// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { Group } from "three";
import type { WorldEdit } from "../game/domain/net/Protocol";
import { isValidRoomCode } from "../game/domain/net/RoomCode";
import type { WorldSaveData } from "../game/domain/world/WorldSaveData";
import type { NetTransport } from "../game/application/ports/NetTransport";
import { makeTransportNetwork } from "../game/application/testing/InMemoryTransportPair";
import { InMemoryWorldSaveStore } from "../game/infrastructure/persistence/InMemoryWorldSaveStore";
import { attachHostNet, createJoinNet, type EditableVoxels } from "./NetSync";

const POSE = { position: [1, 2, 3] as [number, number, number], yaw: 0.5, pitch: 0 };

function save(worldId: string, seed: number): WorldSaveData {
  return {
    worldId,
    seed,
    name: "Home World",
    createdAt: 100,
    modifiedAt: 200,
    modifiedChunks: [{ key: "0,0,0", rev: 1, data: new Uint8Array([9]) }],
    entities: { "quest.flags": ["intro"] },
    inventories: {},
    progression: {},
    playerState: POSE,
  };
}

/** Honest voxel fake: like VoxelTerrain, applying an edit fires onLocalEdit. */
function fakeVoxels() {
  const applied: WorldEdit[] = [];
  const voxels: EditableVoxels = {
    onLocalEdit: null,
    carveAt(x, y, z, radius) {
      const edit: WorldEdit = { op: "dig", x, y, z, radius };
      applied.push(edit);
      voxels.onLocalEdit?.(edit);
    },
    fillAt(x, y, z, radius, materialId = 0) {
      const edit: WorldEdit = { op: "fill", x, y, z, radius, materialId };
      applied.push(edit);
      voxels.onLocalEdit?.(edit);
    },
  };
  return { voxels, applied };
}

async function hostSetup() {
  const net = makeTransportNetwork();
  const store = new InMemoryWorldSaveStore();
  await store.save(save("w1", 42));
  const { voxels, applied } = fakeVoxels();
  const parent = new Group();
  const host = await attachHostNet({
    worldId: "w1",
    seed: 42,
    store,
    getPose: () => POSE,
    voxels,
    parent,
    transportFactory: () => net.host,
  });
  return { net, store, voxels, applied, parent, host };
}

function inbox(transport: NetTransport): unknown[] {
  const messages: unknown[] = [];
  transport.onMessage((_id, msg) => messages.push(msg));
  return messages;
}

describe("attachHostNet", () => {
  it("derives a stable, valid room code from worldId + seed", async () => {
    const a = await hostSetup();
    const b = await hostSetup();
    expect(isValidRoomCode(a.host.code)).toBe(true);
    expect(a.host.code).toBe(b.host.code);
  });

  it("welcomes a joiner with the snapshot loaded from the store", async () => {
    const { net } = await hostSetup();
    const joiner = net.addPeer("alice");
    const messages = inbox(joiner);
    joiner.broadcast({ kind: "join", playerName: "Alice" });

    // E0.4: join also draws a private inventoryState (the fresh authoritative
    // copy) alongside the welcome snapshot.
    expect(messages).toHaveLength(2);
    const welcome = messages.find((m) => (m as { kind: string }).kind === "welcome") as {
      kind: string;
      seed: number;
      modifiedChunks: unknown[];
    };
    expect(welcome.kind).toBe("welcome");
    expect(welcome.seed).toBe(42);
    expect(welcome.modifiedChunks).toHaveLength(1);
  });

  it("applies a joiner dig intent to the live voxels", async () => {
    const { net, applied } = await hostSetup();
    net.addPeer("alice").broadcast({ kind: "dig", x: 1, y: 2, z: 3, radius: 1.5 });
    expect(applied).toEqual([{ op: "dig", x: 1, y: 2, z: 3, radius: 1.5 }]);
  });

  it("does NOT re-broadcast a remote-applied edit (no echo loop)", async () => {
    const { net } = await hostSetup();
    const joiner = net.addPeer("alice");
    const messages = inbox(joiner);
    joiner.broadcast({ kind: "dig", x: 1, y: 2, z: 3, radius: 1.5 });

    const worldEdits = messages.filter((m) => (m as { kind: string }).kind === "worldEdit");
    expect(worldEdits).toHaveLength(1); // HostSession's broadcast only
  });

  it("streams a host groundItems snapshot to joiners (E0.5)", async () => {
    const net = makeTransportNetwork();
    const store = new InMemoryWorldSaveStore();
    await store.save(save("w1", 42));
    let onSnapshot: ((entities: unknown[]) => void) | null = null;
    const groundItems = {
      set onSnapshot(fn: ((entities: unknown[]) => void) | null) {
        onSnapshot = fn;
      },
      get onSnapshot() {
        return onSnapshot;
      },
    };
    await attachHostNet({
      worldId: "w1",
      seed: 42,
      store,
      getPose: () => POSE,
      voxels: null,
      // structural fake — only the onSnapshot seam attachHostNet touches
      groundItems: groundItems as unknown as Parameters<typeof attachHostNet>[0]["groundItems"],
      parent: new Group(),
      transportFactory: () => net.host,
    });

    const joiner = net.addPeer("alice");
    const messages = inbox(joiner);
    const entities = [{ id: "loot:1", itemId: "wood", count: 3, x: 1, y: 0, z: 2 }];
    onSnapshot!(entities);

    expect(messages).toContainEqual({ kind: "groundItems", entities });
  });

  it("broadcasts the host's own local edits to joiners", async () => {
    const { net, voxels } = await hostSetup();
    const joiner = net.addPeer("alice");
    const messages = inbox(joiner);

    voxels.carveAt(5, 6, 7, 2);

    expect(messages).toContainEqual({
      kind: "worldEdit",
      edit: { op: "dig", x: 5, y: 6, z: 7, radius: 2 },
    });
  });

  it("broadcasts the host pose as peerId 'host' every ~100ms of update()", async () => {
    const { net, host } = await hostSetup();
    const joiner = net.addPeer("alice");
    const messages = inbox(joiner);

    host.update(0.05);
    expect(messages.filter((m) => (m as { kind: string }).kind === "peerPose")).toHaveLength(0);
    host.update(0.06);
    host.update(0.1);

    const poses = messages.filter((m) => (m as { kind: string }).kind === "peerPose");
    expect(poses).toHaveLength(2);
    expect(poses[0]).toEqual({ kind: "peerPose", peerId: "host", state: POSE });
  });

  it("renders a remote avatar for a valid joiner pose and drops it on leave", async () => {
    const { net, parent, host } = await hostSetup();
    const joiner = net.addPeer("alice");
    joiner.broadcast({ kind: "pose", state: POSE });

    const group = parent.getObjectByName("remote-players") as Group;
    expect(group.children).toHaveLength(1);
    expect(group.children[0].name).toBe("alice");

    net.removePeer("alice");
    expect(group.children).toHaveLength(0);

    host.dispose();
    expect(parent.getObjectByName("remote-players")).toBeUndefined();
  });
});

describe("createJoinNet", () => {
  async function joinedSetup() {
    const hostSide = await hostSetup();
    const detached = hostSide.net.addDetachedPeer("bob");
    const join = createJoinNet("ABCDEFGH", {
      playerName: "Bob",
      transportFactory: () => detached.transport,
    });
    return { ...hostSide, join, connect: detached.connect };
  }

  it("resolves the welcome once the host peer connects", async () => {
    const { join, connect } = await joinedSetup();
    const pending = join.waitForWelcome(5000);
    connect();
    const welcome = await pending;
    expect(welcome?.seed).toBe(42);
    expect(welcome?.worldId).toBe("w1");
    expect(welcome?.modifiedChunks[0]?.data).toBeInstanceOf(Uint8Array);
  });

  it("resolves null when no host appears before the timeout", async () => {
    const { join } = await joinedSetup();
    expect(await join.waitForWelcome(20)).toBeNull();
  });

  it("re-announces join when a later peer connects before the welcome", async () => {
    // first connection is another joiner (mesh order is not host-first)
    let cb: ((id: string) => void) | null = null;
    const silent: NetTransport = {
      send: () => {},
      broadcast: () => {},
      onMessage: () => {},
      onPeerJoin: (fn) => (cb = fn),
      onPeerLeave: () => {},
      close: () => {},
    };
    const join = createJoinNet("ABCDEFGH", { transportFactory: () => silent });
    const spy = vi.spyOn(silent, "broadcast");
    cb!("other-joiner");
    cb!("host");
    expect(spy.mock.calls.filter(([m]) => (m as { kind: string }).kind === "join").length)
      .toBeGreaterThanOrEqual(1);
    join.dispose();
  });

  it("re-announces join on a timer until the welcome lands (2-peer mesh)", () => {
    vi.useFakeTimers();
    try {
      let cb: ((id: string) => void) | null = null;
      const silent: NetTransport = {
        send: () => {},
        broadcast: () => {},
        onMessage: () => {},
        onPeerJoin: (fn) => (cb = fn),
        onPeerLeave: () => {},
        close: () => {},
      };
      const join = createJoinNet("ABCDEFGH", {
        transportFactory: () => silent,
        announceIntervalMs: 100,
      });
      const spy = vi.spyOn(silent, "broadcast");
      cb!("host"); // the one and only peer-join a 2-peer mesh ever fires
      const joins = () =>
        spy.mock.calls.filter(([m]) => (m as { kind: string }).kind === "join").length;
      const first = joins();
      vi.advanceTimersByTime(350); // three more retry ticks
      expect(joins()).toBeGreaterThan(first);
      join.dispose();
      const afterDispose = joins();
      vi.advanceTimersByTime(500); // timer is cleared — no further announces
      expect(joins()).toBe(afterDispose);
    } finally {
      vi.useRealTimers();
    }
  });

  it("buffers world edits that arrive before the world attaches, then replays", async () => {
    const { join, connect, voxels: hostVoxels } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);

    hostVoxels.carveAt(1, 2, 3, 1); // host digs while the joiner still boots

    const { voxels, applied } = fakeVoxels();
    const parent = new Group();
    join.attachWorld({ voxels, parent, getPose: () => POSE });

    expect(applied).toEqual([{ op: "dig", x: 1, y: 2, z: 3, radius: 1 }]);
  });

  it("applies live world edits and does not echo them back as intents", async () => {
    const { join, connect, voxels: hostVoxels, applied: hostApplied } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);
    const { voxels, applied } = fakeVoxels();
    join.attachWorld({ voxels, parent: new Group(), getPose: () => POSE });

    hostVoxels.carveAt(1, 2, 3, 1);

    expect(applied).toEqual([{ op: "dig", x: 1, y: 2, z: 3, radius: 1 }]);
    expect(hostApplied).toEqual([{ op: "dig", x: 1, y: 2, z: 3, radius: 1 }]); // no boomerang
  });

  it("sends the joiner's local edits to the host as intents", async () => {
    const { join, connect, applied: hostApplied } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);
    const { voxels } = fakeVoxels();
    join.attachWorld({ voxels, parent: new Group(), getPose: () => POSE });

    voxels.carveAt(4, 5, 6, 1.5); // the M8 DigTool applying optimistically

    expect(hostApplied).toContainEqual({ op: "dig", x: 4, y: 5, z: 6, radius: 1.5 });
  });

  it("applies a host groundItems snapshot to the joiner's field and never mutates locally (E0.5)", async () => {
    const { join, connect, net } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);
    const applied: unknown[] = [];
    const groundItems = {
      remote: false,
      onInteractIntent: null as ((targetId: string) => void) | null,
      applySnapshot: (entities: unknown[]) => applied.push(...entities),
    };
    join.attachWorld({
      voxels: null,
      groundItems: groundItems as unknown as Parameters<typeof join.attachWorld>[0]["groundItems"],
      parent: new Group(),
      getPose: () => POSE,
    });

    expect(groundItems.remote).toBe(true);
    net.host.broadcast({
      kind: "groundItems",
      entities: [{ id: "loot:1", itemId: "wood", count: 3, x: 1, y: 0, z: 2 }],
    });

    expect(applied).toEqual([{ id: "loot:1", itemId: "wood", count: 3, x: 1, y: 0, z: 2 }]);
  });

  it("sends a groundItems pickup intent to the host as an interact('pickup') message", async () => {
    const { join, connect, net: hostNet } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);
    const groundItems = {
      remote: false,
      onInteractIntent: null as ((targetId: string) => void) | null,
      applySnapshot: () => {},
    };
    join.attachWorld({
      voxels: null,
      groundItems: groundItems as unknown as Parameters<typeof join.attachWorld>[0]["groundItems"],
      parent: new Group(),
      getPose: () => POSE,
    });

    const interacts: Array<{ action: string; targetId: string }> = [];
    hostNet.host.onMessage((_id, raw) => {
      const m = raw as { kind: string; action?: string; targetId?: string };
      if (m.kind === "interact") interacts.push({ action: m.action!, targetId: m.targetId! });
    });

    groundItems.onInteractIntent?.("loot:1");

    expect(interacts).toEqual([{ action: "pickup", targetId: "loot:1" }]);
  });

  it("sends a pose every ~100ms of update() and shows the host avatar", async () => {
    const { join, connect, parent: hostParent } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);
    const joinParent = new Group();
    const world = join.attachWorld({ voxels: null, parent: joinParent, getPose: () => POSE });

    world.update(0.11); // joiner pose intent → host renders bob

    const hostGroup = hostParent.getObjectByName("remote-players") as Group;
    expect(hostGroup.children.map((c) => c.name)).toEqual(["bob"]);
  });

  it("fires onHostGone when the host closes", async () => {
    const { join, connect, host } = await joinedSetup();
    connect();
    await join.waitForWelcome(5000);
    const onHostGone = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    join.attachWorld({ voxels: null, parent: new Group(), getPose: () => POSE, onHostGone });

    host.dispose();

    expect(onHostGone).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  // A controllable transport to drive the host-offline state machine directly —
  // the in-memory network models the JOINER dropping, not the host.
  function controllable() {
    const cbs = {
      msg: [] as ((id: string, m: unknown) => void)[],
      join: [] as ((id: string) => void)[],
      leave: [] as ((id: string) => void)[],
    };
    const transport: NetTransport = {
      send: () => {},
      broadcast: () => {},
      onMessage: (cb) => cbs.msg.push(cb),
      onPeerJoin: (cb) => cbs.join.push(cb),
      onPeerLeave: (cb) => cbs.leave.push(cb),
      close: () => {},
    };
    const welcome = {
      kind: "welcome",
      seed: 42,
      worldId: "w1",
      name: "Home World",
      modifiedChunks: [{ key: "0,0,0", rev: 1, data: new Uint8Array([9]) }],
      entities: {},
    };
    return {
      transport,
      fireJoin: (id = "host") => cbs.join.forEach((cb) => cb(id)),
      fireLeave: (id = "host") => cbs.leave.forEach((cb) => cb(id)),
      deliverWelcome: (id = "host") => cbs.msg.forEach((cb) => cb(id, welcome)),
    };
  }

  it("fires onHostGone on a host connection drop (no clean close)", async () => {
    const c = controllable();
    const join = createJoinNet("ABCDEFGH", { transportFactory: () => c.transport });
    c.fireJoin();
    c.deliverWelcome();
    await join.waitForWelcome(50);
    const onHostGone = vi.fn();
    join.attachWorld({ voxels: null, parent: new Group(), getPose: () => POSE, onHostGone });

    c.fireLeave(); // host vanished — no hostClosing message, just the drop
    expect(onHostGone).toHaveBeenCalledOnce();
  });

  it("fires onHostReturned when the host reconnects within the window", async () => {
    const c = controllable();
    const join = createJoinNet("ABCDEFGH", { transportFactory: () => c.transport });
    c.fireJoin();
    c.deliverWelcome();
    await join.waitForWelcome(50);
    const onHostGone = vi.fn();
    const onHostReturned = vi.fn();
    join.attachWorld({
      voxels: null,
      parent: new Group(),
      getPose: () => POSE,
      onHostGone,
      onHostReturned,
    });

    c.fireLeave(); // drop
    c.fireJoin(); // transient reconnect — welcome already held, so resume
    expect(onHostGone).toHaveBeenCalledOnce();
    expect(onHostReturned).toHaveBeenCalledOnce();
  });
});
