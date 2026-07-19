import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOk } from "../domain/Result";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { WorldEdit } from "../domain/net/Protocol";
import { HostSession, type HostSessionHooks, type WorldSnapshot } from "./HostSession";
import { makeTransportNetwork } from "./testing/InMemoryTransportPair";
import type { NetTransport } from "./ports/NetTransport";

const SNAPSHOT: WorldSnapshot = {
  seed: 1234,
  worldId: "w1",
  name: "Home World",
  modifiedChunks: [{ key: "0,0,0", rev: 2, data: new Uint8Array([7]) }],
  entities: { "creature:1": { hp: 10 } },
};

const REGISTRY = (() => {
  const r = ItemRegistry.create([
    { id: "wood", displayName: "Wood", maxStackSize: 64, tags: [], tier: 0 },
    { id: "stone", displayName: "Stone", maxStackSize: 16, tags: [], tier: 0 },
    { id: "bread", displayName: "Bread", maxStackSize: 8, tags: [], tier: 0 },
  ]);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

function pose(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], yaw: 0, pitch: 0 };
}

function collect(transport: NetTransport): unknown[] {
  const inbox: unknown[] = [];
  transport.onMessage((_peerId, msg) => inbox.push(msg));
  return inbox;
}

function inventoryStateOf(inbox: unknown[]): { kind: string; capacity: number; slots: unknown[] } | undefined {
  return inbox.find((m) => (m as { kind: string }).kind === "inventoryState") as
    | { kind: string; capacity: number; slots: unknown[] }
    | undefined;
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

  it("replies to a join intent with a welcome + the fresh inventoryState", () => {
    const alice = net.addPeer("alice");
    const inbox = collect(alice);
    alice.broadcast({ kind: "join", playerName: "Alice" });
    expect(inbox).toContainEqual({ kind: "welcome", ...SNAPSHOT });
    expect(inventoryStateOf(inbox)).toEqual({ kind: "inventoryState", capacity: 27, slots: Array(27).fill(null) });
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

  it("resolves a valid placeableInteract via the hook and broadcasts the state to ALL peers", () => {
    const calls: Array<{ action: string; placeableId: string; peerId: string }> = [];
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: (action, placeableId, peerId) => {
        calls.push({ action, placeableId, peerId });
        return { state: { open: true } };
      },
    });
    const alice = net.addPeer("alice");
    const bob = net.addPeer("bob");
    const aliceInbox = collect(alice);
    const bobInbox = collect(bob);

    alice.broadcast({ kind: "placeableInteract", action: "toggleDoor", placeableId: "piece:1" });

    expect(calls).toEqual([{ action: "toggleDoor", placeableId: "piece:1", peerId: "alice" }]);
    const expected = { kind: "placeableState", placeableId: "piece:1", state: { open: true } };
    expect(aliceInbox).toContainEqual(expected);
    expect(bobInbox).toContainEqual(expected);
  });

  it("passes itemId/count through to the hook", () => {
    const calls: Array<{ itemId?: string; count?: number }> = [];
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: (_a, _p, _peer, itemId, count) => {
        calls.push({ itemId, count });
        return { state: { ok: true } };
      },
    });
    const alice = net.addPeer("alice");
    alice.broadcast({
      kind: "placeableInteract",
      action: "toggleDoor",
      placeableId: "piece:2",
      itemId: "wood",
      count: 4,
    });
    expect(calls).toEqual([{ itemId: "wood", count: 4 }]);
  });

  it("does not broadcast when the hook rejects (undefined/null)", () => {
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: () => undefined,
    });
    const alice = net.addPeer("alice");
    const inbox = collect(alice);
    alice.broadcast({ kind: "placeableInteract", action: "toggleDoor", placeableId: "piece:1" });
    expect(inbox).toEqual([]);
  });

  it("drops a placeableInteract with an empty placeableId (no hook call)", () => {
    const calls: string[] = [];
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: (_a, placeableId) => {
        calls.push(placeableId);
        return { state: { ok: true } };
      },
    });
    const alice = net.addPeer("alice");
    alice.broadcast({ kind: "placeableInteract", action: "toggleDoor", placeableId: "" });
    expect(calls).toEqual([]);
  });

  it("broadcasts hostClosing on close", () => {
    const alice = net.addPeer("alice");
    const inbox = collect(alice);
    session.close();
    expect(inbox).toEqual([{ kind: "hostClosing" }]);
  });

  // ---- E0.4: per-peer authoritative inventory ----

  describe("inventory authority", () => {
    function hostedSession(
      onPlaceableInteract: HostSessionHooks["onPlaceableInteract"],
    ): { net: ReturnType<typeof makeTransportNetwork>; session: HostSession } {
      const net2 = makeTransportNetwork();
      const session2 = new HostSession(
        net2.host,
        () => SNAPSHOT,
        { onWorldEdit: () => {}, onPlaceableInteract },
        { registry: REGISTRY },
      );
      return { net: net2, session: session2 };
    }

    it("seeds a fresh peer with an empty 27-slot inventory", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const inbox = collect(alice);
      alice.broadcast({ kind: "join", playerName: "Alice" });
      expect(inventoryStateOf(inbox)).toEqual({
        kind: "inventoryState",
        capacity: 27,
        slots: Array(27).fill(null),
      });
    });

    it("seeds from a well-formed claimed inventory matching the expected capacity", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const inbox = collect(alice);
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 5 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      expect(inventoryStateOf(inbox)).toEqual({ kind: "inventoryState", capacity: 27, slots });
    });

    it("ignores a claimed inventory with an unknown item (never trusts the claim)", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const inbox = collect(alice);
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "unobtainium", count: 5 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      expect(inventoryStateOf(inbox)).toEqual({
        kind: "inventoryState",
        capacity: 27,
        slots: Array(27).fill(null),
      });
    });

    it("ignores a claimed inventory with the wrong capacity", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const inbox = collect(alice);
      alice.broadcast({
        kind: "join",
        playerName: "Alice",
        inventory: { capacity: 40, slots: Array(40).fill(null) },
      });
      expect(inventoryStateOf(inbox)).toEqual({
        kind: "inventoryState",
        capacity: 27,
        slots: Array(27).fill(null),
      });
    });

    it("depositChest: debits the sender, applies the chest, sends inventoryState — never broadcasts the inventory", () => {
      const chestCalls: Array<[string, string, string, string | undefined, number | undefined]> = [];
      const { net: net2 } = hostedSession((action, placeableId, peerId, itemId, count) => {
        chestCalls.push([action, placeableId, peerId, itemId, count]);
        return { state: { deposited: true } };
      });
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 10 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);

      alice.broadcast({
        kind: "placeableInteract",
        action: "depositChest",
        placeableId: "chest:1",
        itemId: "wood",
        count: 4,
      });

      expect(chestCalls).toEqual([["depositChest", "chest:1", "alice", "wood", 4]]);
      expect(aliceInbox).toContainEqual({
        kind: "placeableState",
        placeableId: "chest:1",
        state: { deposited: true },
      });
      expect(bobInbox).toContainEqual({
        kind: "placeableState",
        placeableId: "chest:1",
        state: { deposited: true },
      });
      const state = inventoryStateOf(aliceInbox);
      expect(state?.slots[0]).toEqual({ itemId: "wood", count: 6 });
      // an inventory is private — bob never receives alice's inventoryState
      expect(bobInbox.some((m) => (m as { kind: string }).kind === "inventoryState")).toBe(false);
    });

    it("depositChest: drops silently when the sender doesn't actually have the item (no conjuring)", () => {
      const chestCalls: string[] = [];
      const { net: net2 } = hostedSession((action) => {
        chestCalls.push(action);
        return { state: { deposited: true } };
      });
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" }); // empty inventory
      const inbox = collect(alice);

      alice.broadcast({
        kind: "placeableInteract",
        action: "depositChest",
        placeableId: "chest:1",
        itemId: "wood",
        count: 4,
      });

      expect(chestCalls).toEqual([]); // never even reached the chest resolver
      expect(inbox).toEqual([]);
    });

    it("depositChest: rolls back the debit when the chest rejects (full) — the sender keeps the stack", () => {
      let rejectNext = true;
      const { net: net2 } = hostedSession(() => {
        if (rejectNext) return undefined; // chest full/rejects the first attempt
        return { state: { deposited: true } };
      });
      const alice = net2.addPeer("alice");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 10 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({
        kind: "placeableInteract",
        action: "depositChest",
        placeableId: "chest:1",
        itemId: "wood",
        count: 4,
      });
      expect(inbox).toEqual([]); // no placeableState, no inventoryState — debit never committed

      // if the debit HAD committed, alice would only have 6 wood left and
      // this full-stack (10) deposit would fail for insufficient funds too;
      // instead it succeeds, proving all 10 are still there
      rejectNext = false;
      alice.broadcast({
        kind: "placeableInteract",
        action: "depositChest",
        placeableId: "chest:1",
        itemId: "wood",
        count: 10,
      });
      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toBeNull(); // all 10 wood successfully left for the chest
    });

    it("withdrawChest: credits the sender from the resolver's grant, sends inventoryState privately", () => {
      const { net: net2 } = hostedSession((action) => {
        if (action === "withdrawChest") {
          return { state: { withdrawn: true }, grant: { itemId: "stone", count: 3 } };
        }
        return undefined;
      });
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);

      alice.broadcast({
        kind: "placeableInteract",
        action: "withdrawChest",
        placeableId: "chest:1",
        itemId: "stone",
        count: 3,
      });

      expect(aliceInbox).toContainEqual({
        kind: "placeableState",
        placeableId: "chest:1",
        state: { withdrawn: true },
      });
      const state = inventoryStateOf(aliceInbox);
      expect(state?.slots[0]).toEqual({ itemId: "stone", count: 3 });
      expect(bobInbox.some((m) => (m as { kind: string }).kind === "inventoryState")).toBe(false);
    });

    it("withdrawChest: rolls back (re-deposits) when the sender's bag is full, no item lost or duplicated", () => {
      const depositCalls: number[] = [];
      const { net: net2 } = hostedSession((action, _p, _peer, _itemId, count) => {
        if (action === "withdrawChest") return { state: { withdrawn: true }, grant: { itemId: "stone", count: 3 } };
        if (action === "depositChest") {
          depositCalls.push(count ?? 0);
          return { state: { restored: true } };
        }
        return undefined;
      });
      const alice = net2.addPeer("alice");
      // fill alice's whole 27-slot inventory with a DIFFERENT item so `stone`
      // truly has nowhere to go (no existing stone stack to top up either)
      const slots = Array.from({ length: 27 }, () => ({ itemId: "wood", count: 64 }));
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({
        kind: "placeableInteract",
        action: "withdrawChest",
        placeableId: "chest:1",
        itemId: "stone",
        count: 3,
      });

      expect(depositCalls).toEqual([3]); // compensating re-deposit of exactly what was withdrawn
      expect(inbox).toContainEqual({
        kind: "placeableState",
        placeableId: "chest:1",
        state: { restored: true },
      });
      // no inventoryState sent — the sender's inventory never actually changed
      expect(inbox.some((m) => (m as { kind: string }).kind === "inventoryState")).toBe(false);
    });

    it("harvestCrop/collectCook: credits the sender's inventory from the grant, never the host's own", () => {
      const { net: net2 } = hostedSession((action) => {
        if (action === "harvestCrop") return { state: { harvested: true }, grant: { itemId: "wood", count: 2 } };
        return undefined;
      });
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "placeableInteract", action: "harvestCrop", placeableId: "plot:1" });

      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toEqual({ itemId: "wood", count: 2 });
    });

    it("harvestCrop: a full bag drops the grant but the placeable state still applies (matches solo InventoryFull contract)", () => {
      const { net: net2 } = hostedSession((action) => {
        if (action === "harvestCrop") return { state: { harvested: true }, grant: { itemId: "wood", count: 2 } };
        return undefined;
      });
      const alice = net2.addPeer("alice");
      const slots = Array.from({ length: 27 }, () => ({ itemId: "stone", count: 16 }));
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({ kind: "placeableInteract", action: "harvestCrop", placeableId: "plot:1" });

      expect(inbox).toContainEqual({ kind: "placeableState", placeableId: "plot:1", state: { harvested: true } });
      expect(inbox.some((m) => (m as { kind: string }).kind === "inventoryState")).toBe(false);
    });

    it("startCook/plantCrop: no debit/credit — no inventoryState sent, matches solo play", () => {
      const { net: net2 } = hostedSession(() => ({ state: { started: true } }));
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "placeableInteract", action: "startCook", placeableId: "fire:1", itemId: "wood" });
      alice.broadcast({
        kind: "placeableInteract",
        action: "plantCrop",
        placeableId: "plot:1",
        itemId: "wheat-seed",
      });

      expect(inbox.some((m) => (m as { kind: string }).kind === "inventoryState")).toBe(false);
      expect(inbox.filter((m) => (m as { kind: string }).kind === "placeableState")).toHaveLength(2);
    });

    // ---- inventoryOp ----

    it("inventoryOp move: reorders the sender's own slots, sends the new inventoryState", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 5 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({ kind: "inventoryOp", inventoryOp: { op: "move", from: 0, to: 1 } });

      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toBeNull();
      expect(state?.slots[1]).toEqual({ itemId: "wood", count: 5 });
    });

    it("inventoryOp move: drops an out-of-range index (no inventoryState sent)", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "inventoryOp", inventoryOp: { op: "move", from: 0, to: 999 } });

      expect(inbox).toEqual([]);
    });

    it("inventoryOp split: splits a stack into an empty slot", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 10 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({ kind: "inventoryOp", inventoryOp: { op: "split", from: 0, count: 4 } });

      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toEqual({ itemId: "wood", count: 6 });
      expect(state?.slots[1]).toEqual({ itemId: "wood", count: 4 });
    });

    it("inventoryOp split: drops an impossible split (count >= stack size) without crashing", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 3 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({ kind: "inventoryOp", inventoryOp: { op: "split", from: 0, count: 3 } });

      expect(inbox).toEqual([]);
    });

    it("inventoryOp use: removes one unit from the slot", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "bread", count: 2 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({ kind: "inventoryOp", inventoryOp: { op: "use", index: 0 } });

      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toEqual({ itemId: "bread", count: 1 });
    });

    it("inventoryOp use: drops a use on an empty slot", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "inventoryOp", inventoryOp: { op: "use", index: 0 } });

      expect(inbox).toEqual([]);
    });

    it("inventoryOp deposit/withdraw: same atomic debit/credit contract as placeableInteract", () => {
      const { net: net2 } = hostedSession((action, placeableId, peerId, itemId, count) => {
        if (action === "depositChest") return { state: { itemId, count, at: placeableId, peerId } };
        return undefined;
      });
      const alice = net2.addPeer("alice");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 10 };
      alice.broadcast({ kind: "join", playerName: "Alice", inventory: { capacity: 27, slots } });
      const inbox = collect(alice);

      alice.broadcast({
        kind: "inventoryOp",
        inventoryOp: { op: "deposit", placeableId: "chest:1", itemId: "wood", count: 4 },
      });

      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toEqual({ itemId: "wood", count: 6 });
    });

    it("inventoryOp: dropped entirely from an unknown peer (no session record yet)", () => {
      const { net: net2, session: session2 } = hostedSession(undefined);
      void session2;
      const detached = net2.addDetachedPeer("ghost");
      const inbox = collect(detached.transport);
      // never calls connect() — the host has no peer record for "ghost"
      expect(() =>
        detached.transport.broadcast({ kind: "inventoryOp", inventoryOp: { op: "use", index: 0 } }),
      ).not.toThrow();
      expect(inbox).toEqual([]);
    });
  });
});
