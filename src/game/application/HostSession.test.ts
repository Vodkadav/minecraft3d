import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { WorldEdit } from "../domain/net/Protocol";
import { HostSession, type WorldSnapshot } from "./HostSession";
import { makeTransportNetwork } from "./testing/InMemoryTransportPair";
import type { NetTransport } from "./ports/NetTransport";

const SNAPSHOT: WorldSnapshot = {
  seed: 1234,
  worldId: "w1",
  name: "Home World",
  modifiedChunks: [{ key: "0,0,0", rev: 2, data: new Uint8Array([7]) }],
  entities: { "creature:1": { hp: 10 } },
};

function pose(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], yaw: 0, pitch: 0 };
}

function collect(transport: NetTransport): unknown[] {
  const inbox: unknown[] = [];
  transport.onMessage((_peerId, msg) => inbox.push(msg));
  return inbox;
}

describe("HostSession", () => {
  let net: ReturnType<typeof makeTransportNetwork>;
  let edits: WorldEdit[];
  let now: number;
  let session: HostSession;

  beforeEach(() => {
    net = makeTransportNetwork();
    edits = [];
    now = 1000;
    session = new HostSession(
      net.host,
      () => SNAPSHOT,
      { onWorldEdit: (edit) => edits.push(edit) },
      { clock: () => now },
    );
  });

  it("replies to a join intent with a welcome carrying the snapshot", () => {
    const alice = net.addPeer("alice");
    const inbox = collect(alice);
    alice.broadcast({ kind: "join", playerName: "Alice" });
    expect(inbox).toEqual([{ kind: "welcome", ...SNAPSHOT }]);
  });

  it("announces a new joiner to the OTHER peers only", () => {
    const alice = net.addPeer("alice");
    const aliceInbox = collect(alice);
    alice.broadcast({ kind: "join", playerName: "Alice" });

    const bob = net.addPeer("bob");
    const bobInbox = collect(bob);
    bob.broadcast({ kind: "join", playerName: "Bob" });

    expect(aliceInbox).toContainEqual({ kind: "peerJoined", peerId: "bob", playerName: "Bob" });
    expect(bobInbox.filter((m) => (m as { kind: string }).kind === "peerJoined")).toEqual([]);
  });

  it("rebroadcasts a valid pose to other peers only, tagged with the sender", () => {
    const alice = net.addPeer("alice");
    const bob = net.addPeer("bob");
    const aliceInbox = collect(alice);
    const bobInbox = collect(bob);

    alice.broadcast({ kind: "pose", state: pose(1, 2, 3) });

    expect(bobInbox).toEqual([{ kind: "peerPose", peerId: "alice", state: pose(1, 2, 3) }]);
    expect(aliceInbox).toEqual([]);
  });

  it("drops a teleporting pose (speed cap) and does not rebroadcast it", () => {
    const alice = net.addPeer("alice");
    const bob = net.addPeer("bob");
    const bobInbox = collect(bob);

    alice.broadcast({ kind: "pose", state: pose(0, 0, 0) });
    now += 100;
    alice.broadcast({ kind: "pose", state: pose(1000, 0, 0) });

    expect(bobInbox).toHaveLength(1); // only the first pose got through
  });

  it("accepts consecutive poses under the cap using the injected clock", () => {
    const alice = net.addPeer("alice");
    const bob = net.addPeer("bob");
    const bobInbox = collect(bob);

    alice.broadcast({ kind: "pose", state: pose(0, 0, 0) });
    now += 100;
    alice.broadcast({ kind: "pose", state: pose(1, 0, 0) }); // 10 m/s

    expect(bobInbox).toHaveLength(2);
  });

  it("applies a valid dig via the hook and broadcasts the edit to ALL peers", () => {
    const alice = net.addPeer("alice");
    const bob = net.addPeer("bob");
    const aliceInbox = collect(alice);
    const bobInbox = collect(bob);

    alice.broadcast({ kind: "dig", x: 5, y: 6, z: 7, radius: 2 });

    const edit: WorldEdit = { op: "dig", x: 5, y: 6, z: 7, radius: 2 };
    expect(edits).toEqual([edit]);
    expect(aliceInbox).toEqual([{ kind: "worldEdit", edit }]);
    expect(bobInbox).toEqual([{ kind: "worldEdit", edit }]);
  });

  it("applies a valid fill with its materialId", () => {
    const alice = net.addPeer("alice");
    alice.broadcast({ kind: "fill", x: 1, y: 2, z: 3, radius: 1, materialId: 4 });
    expect(edits).toEqual([{ op: "fill", x: 1, y: 2, z: 3, radius: 1, materialId: 4 }]);
  });

  it("rejects an oversized dig: no hook, no broadcast", () => {
    const alice = net.addPeer("alice");
    const inbox = collect(alice);
    alice.broadcast({ kind: "dig", x: 5, y: 6, z: 7, radius: 99 });
    expect(edits).toEqual([]);
    expect(inbox).toEqual([]);
  });

  it("surfaces valid poses to the host app via onPeerPose", () => {
    const poses: Array<{ peerId: string; state: PlayerState }> = [];
    net = makeTransportNetwork();
    session = new HostSession(
      net.host,
      () => SNAPSHOT,
      {
        onWorldEdit: () => {},
        onPeerPose: (peerId, state) => poses.push({ peerId, state }),
      },
      { clock: () => now },
    );
    const alice = net.addPeer("alice");

    alice.broadcast({ kind: "pose", state: pose(1, 2, 3) });

    expect(poses).toEqual([{ peerId: "alice", state: pose(1, 2, 3) }]);
  });

  it("does NOT surface a rejected (teleporting) pose via onPeerPose", () => {
    const poses: PlayerState[] = [];
    net = makeTransportNetwork();
    session = new HostSession(
      net.host,
      () => SNAPSHOT,
      { onWorldEdit: () => {}, onPeerPose: (_id, state) => poses.push(state) },
      { clock: () => now },
    );
    const alice = net.addPeer("alice");

    alice.broadcast({ kind: "pose", state: pose(0, 0, 0) });
    now += 100;
    alice.broadcast({ kind: "pose", state: pose(1000, 0, 0) });

    expect(poses).toEqual([pose(0, 0, 0)]);
  });

  it("surfaces peer lifecycle to the host app via onPeerJoined/onPeerLeft", () => {
    const events: string[] = [];
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPeerJoined: (peerId, name) => events.push(`joined:${peerId}:${name}`),
      onPeerLeft: (peerId) => events.push(`left:${peerId}`),
    });
    const alice = net.addPeer("alice");
    alice.broadcast({ kind: "join", playerName: "Alice" });
    net.removePeer("alice");

    expect(events).toEqual(["joined:alice:Alice", "left:alice"]);
  });

  it("broadcasts peerLeft when a peer drops", () => {
    net.addPeer("alice");
    const bob = net.addPeer("bob");
    const bobInbox = collect(bob);
    net.removePeer("alice");
    expect(bobInbox).toContainEqual({ kind: "peerLeft", peerId: "alice" });
  });

  it("ignores malformed messages with a warning, without crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alice = net.addPeer("alice");
    expect(() => alice.broadcast({ kind: "nonsense" })).not.toThrow();
    expect(() => alice.broadcast(42)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(edits).toEqual([]);
    warn.mockRestore();
  });

  it("routes a valid interact intent to the onInteract hook, tagged with the sender", () => {
    const interacts: Array<{ action: string; targetId: string; peerId: string }> = [];
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onInteract: (action, targetId, peerId) => interacts.push({ action, targetId, peerId }),
    });
    const alice = net.addPeer("alice");

    alice.broadcast({ kind: "interact", action: "attack", targetId: "spawn:7" });
    alice.broadcast({ kind: "interact", action: "feed", targetId: "spawn:8" });
    alice.broadcast({ kind: "interact", action: "mount", targetId: "spawn:9" });
    alice.broadcast({ kind: "interact", action: "dismount", targetId: "spawn:9" });

    expect(interacts).toEqual([
      { action: "attack", targetId: "spawn:7", peerId: "alice" },
      { action: "feed", targetId: "spawn:8", peerId: "alice" },
      { action: "mount", targetId: "spawn:9", peerId: "alice" },
      { action: "dismount", targetId: "spawn:9", peerId: "alice" },
    ]);
  });

  it("drops an interact with an unknown action (no hook call)", () => {
    const interacts: string[] = [];
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onInteract: (action) => interacts.push(action),
    });
    const alice = net.addPeer("alice");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    alice.broadcast({ kind: "interact", action: "dance", targetId: "spawn:7" });
    expect(interacts).toEqual([]);
    warn.mockRestore();
  });

  it("broadcasts hostClosing on close", () => {
    const alice = net.addPeer("alice");
    const inbox = collect(alice);
    session.close();
    expect(inbox).toEqual([{ kind: "hostClosing" }]);
  });
});
