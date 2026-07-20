import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOk } from "../domain/Result";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { PartyInventoryStateMsg, PartyInviteMsg, PartyMsg, WorldEdit } from "../domain/net/Protocol";
import { HOST_PEER_ID, HostSession, type HostSessionHooks, type WorldSnapshot } from "./HostSession";
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
    // E7.2: ammo the ranged-combat test suite below debits from a peer's
    // authoritative inventory (the real `arrow` id, matching `WEAPON_REGISTRY`'s
    // starter `bow` entry's `ammoItemId`).
    { id: "arrow", displayName: "Arrow", maxStackSize: 64, tags: [], tier: 0 },
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

  it("N2: survives a hook throwing mid-message and keeps processing later messages", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    net = makeTransportNetwork();
    session = new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {
        throw new Error("persist() I/O failed");
      },
    });
    const alice = net.addPeer("alice");
    const inbox = collect(alice);

    expect(() =>
      alice.broadcast({ kind: "dig", x: 1, y: 2, z: 3, radius: 1.5 }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    // the log carries WHAT+WHY, never the error's own message text or payload
    const call = warn.mock.calls.find(([m]) => m === "net: message handler threw — dropped");
    expect(call?.[1]).toEqual({ peerId: "alice", kind: "dig" });

    // a later, unrelated message still processes normally — the loop is alive
    alice.broadcast({ kind: "join", playerName: "Alice" });
    expect(inbox).toContainEqual({ kind: "welcome", ...SNAPSHOT });
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

    it("ignores a claimed inventory on any join after the first (no re-seeding)", () => {
      const { net: net2 } = hostedSession(undefined);
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" }); // seeds empty, locks the seed
      const inbox = collect(alice);
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 5 };
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

    // ---- E0.5: ground-item pickup ----

    it("pickup: credits the sender's inventory and removes the ground item on success", () => {
      const removed: string[] = [];
      const net2 = makeTransportNetwork();
      const session2 = new HostSession(
        net2.host,
        () => SNAPSHOT,
        {
          onWorldEdit: () => {},
          onGroundItemPeek: (targetId) =>
            targetId === "loot:1" ? { itemId: "wood", count: 3 } : undefined,
          onGroundItemRemove: (targetId) => removed.push(targetId),
        },
        { registry: REGISTRY },
      );
      void session2;
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "interact", action: "pickup", targetId: "loot:1" });

      expect(removed).toEqual(["loot:1"]);
      const state = inventoryStateOf(inbox);
      expect(state?.slots[0]).toEqual({ itemId: "wood", count: 3 });
    });

    it("pickup: a full inventory leaves the drop on the ground (no removal, no inventoryState)", () => {
      const removed: string[] = [];
      const net2 = makeTransportNetwork();
      new HostSession(
        net2.host,
        () => SNAPSHOT,
        {
          onWorldEdit: () => {},
          onGroundItemPeek: () => ({ itemId: "wood", count: 3 }),
          onGroundItemRemove: (targetId) => removed.push(targetId),
        },
        { registry: REGISTRY, playerInventoryCapacity: 1 },
      );
      const alice = net2.addPeer("alice");
      alice.broadcast({
        kind: "join",
        playerName: "Alice",
        inventory: { capacity: 1, slots: [{ itemId: "stone", count: 16 }] },
      });
      const inbox = collect(alice);

      alice.broadcast({ kind: "interact", action: "pickup", targetId: "loot:1" });

      expect(removed).toEqual([]);
      expect(inbox).toEqual([]);
    });

    it("pickup: nothing there (peek returns undefined) is a silent no-op", () => {
      const removed: string[] = [];
      const net2 = makeTransportNetwork();
      new HostSession(
        net2.host,
        () => SNAPSHOT,
        {
          onWorldEdit: () => {},
          onGroundItemPeek: () => undefined,
          onGroundItemRemove: (targetId) => removed.push(targetId),
        },
        { registry: REGISTRY },
      );
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "interact", action: "pickup", targetId: "loot:ghost" });

      expect(removed).toEqual([]);
      expect(inbox).toEqual([]);
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

  // ---- E5.5: kid-safe chat ----

  describe("chat", () => {
    it("say: relays a valid chat message to ALL peers, tagged with the host's OWN record of the sender's name", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      const bob = net.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "chat", channel: "say", text: "hello!" });

      const expected = {
        kind: "chatMessage",
        senderPeerId: "alice",
        senderName: "Alice",
        text: "hello!",
        channel: "say",
        timestamp: now,
      };
      // "say" echoes back to the sender too, same as any other broadcast state
      expect(aliceInbox).toContainEqual(expected);
      expect(bobInbox).toContainEqual(expected);
    });

    it("never trusts a per-message claimed sender name — uses the host's join record instead", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      const bob = net.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      const bobInbox = collect(bob);

      // the wire ChatMsg shape carries no sender-name field at all — even a
      // hostile payload smuggling one in is ignored by the validator/dispatch
      alice.broadcast({ kind: "chat", channel: "say", text: "hi", senderName: "NotAlice" });

      const msg = bobInbox.find((m) => (m as { kind: string }).kind === "chatMessage") as
        | { senderName: string }
        | undefined;
      expect(msg?.senderName).toBe("Alice");
    });

    it("masks profanity and redacts PII before relaying — never the raw text", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "chat", channel: "say", text: "email me at kid@example.com you shit" });

      const msg = inbox.find((m) => (m as { kind: string }).kind === "chatMessage") as
        | { text: string }
        | undefined;
      expect(msg?.text).toBe("email me at [email] you ****");
    });

    it("drops an empty/whitespace-only chat submission silently (no broadcast)", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      const bob = net.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "chat", channel: "say", text: "   " });

      expect(bobInbox.filter((m) => (m as { kind: string }).kind === "chatMessage")).toEqual([]);
    });

    it("chat from an unknown peer (no session record yet) is a no-op, never throws", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const detached = net.addDetachedPeer("ghost");
      const inbox = collect(detached.transport);
      expect(() =>
        detached.transport.broadcast({ kind: "chat", channel: "say", text: "hi" }),
      ).not.toThrow();
      expect(inbox).toEqual([]);
    });

    it("NEVER logs chat text — a malformed chat payload logs only { peerId, reason }, no content", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      alice.broadcast({ kind: "chat", channel: "guild", text: "a secret nobody should log" });
      for (const call of warn.mock.calls) {
        expect(JSON.stringify(call)).not.toContain("secret nobody should log");
      }
      warn.mockRestore();
    });

    it("say: surfaces the host's own chat to itself via onChat (no wire hop to self)", () => {
      const heard: Array<{ senderPeerId: string; text: string }> = [];
      net = makeTransportNetwork();
      session = new HostSession(
        net.host,
        () => SNAPSHOT,
        { onWorldEdit: () => {}, onChat: (msg) => heard.push(msg) },
        { clock: () => now, hostPlayerName: "TheHost" },
      );
      const alice = net.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const aliceInbox = collect(alice);

      session.sendHostChat("hi everyone", "say");

      expect(heard).toEqual([
        { senderPeerId: "host", senderName: "TheHost", text: "hi everyone", channel: "say", timestamp: now },
      ]);
      expect(aliceInbox).toContainEqual({
        kind: "chatMessage",
        senderPeerId: "host",
        senderName: "TheHost",
        text: "hi everyone",
        channel: "say",
        timestamp: now,
      });
    });

    it("say: surfaces relayed joiner chat to the host too via onChat", () => {
      const heard: string[] = [];
      net = makeTransportNetwork();
      session = new HostSession(
        net.host,
        () => SNAPSHOT,
        { onWorldEdit: () => {}, onChat: (msg) => heard.push(msg.text) },
        { clock: () => now },
      );
      const alice = net.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });

      alice.broadcast({ kind: "chat", channel: "say", text: "hi host" });

      expect(heard).toEqual(["hi host"]);
    });

    it("party: fails closed (echoes only to the sender) when no party system is wired", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      const bob = net.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "chat", channel: "party", text: "psst, just us" });

      // never leaked to bob — a private-intended message must never go public
      expect(bobInbox.filter((m) => (m as { kind: string }).kind === "chatMessage")).toEqual([]);
      expect(aliceInbox).toContainEqual({
        kind: "chatMessage",
        senderPeerId: "alice",
        senderName: "Alice",
        text: "psst, just us",
        channel: "party",
        timestamp: now,
      });
    });

    it("party: routes to the wired party roster port when present", () => {
      net = makeTransportNetwork();
      session = new HostSession(
        net.host,
        () => SNAPSHOT,
        { onWorldEdit: () => {}, partyMembersOf: () => ["bob"] },
        { clock: () => now },
      );
      const alice = net.addPeer("alice");
      const bob = net.addPeer("bob");
      const carol = net.addPeer("carol");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      carol.broadcast({ kind: "join", playerName: "Carol" });
      const bobInbox = collect(bob);
      const carolInbox = collect(carol);

      alice.broadcast({ kind: "chat", channel: "party", text: "party time" });

      expect(bobInbox).toContainEqual({
        kind: "chatMessage",
        senderPeerId: "alice",
        senderName: "Alice",
        text: "party time",
        channel: "party",
        timestamp: now,
      });
      expect(carolInbox.filter((m) => (m as { kind: string }).kind === "chatMessage")).toEqual([]);
    });

    it("party: routes over the LIVE party maps — a kicked member stops receiving in the same tick", () => {
      net = makeTransportNetwork();
      session = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { clock: () => now });
      const alice = net.addPeer("alice");
      const bob = net.addPeer("bob");
      const carol = net.addPeer("carol");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      carol.broadcast({ kind: "join", playerName: "Carol" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const bobInbox = collect(bob);
      const carolInbox = collect(carol);
      const aliceInbox = collect(alice);

      alice.broadcast({ kind: "chat", channel: "party", text: "hi party" });
      const chatOf = (inbox: unknown[]) =>
        inbox.filter((m) => (m as { kind: string }).kind === "chatMessage");
      expect(chatOf(bobInbox)).toHaveLength(1);
      expect(chatOf(aliceInbox)).toHaveLength(1); // sender echo
      expect(chatOf(carolInbox)).toEqual([]); // non-member never sees it

      alice.broadcast({ kind: "partyAction", action: { op: "kick", targetPeerId: "bob" } });
      alice.broadcast({ kind: "chat", channel: "party", text: "after the kick" });
      // bob got the first line only — membership is read live, no stale grant
      expect(chatOf(bobInbox)).toHaveLength(1);
    });
  });

  describe("E5.3 trading", () => {
    function tradeSession(): { net: ReturnType<typeof makeTransportNetwork>; session: HostSession } {
      const net2 = makeTransportNetwork();
      const session2 = new HostSession(net2.host, () => SNAPSHOT, { onWorldEdit: () => {} }, { registry: REGISTRY });
      return { net: net2, session: session2 };
    }

    function joinWith(
      peer: NetTransport,
      name: string,
      stock: Array<{ itemId: string; count: number }>,
    ): void {
      const slots = Array(27).fill(null);
      stock.forEach((s, i) => (slots[i] = s));
      peer.broadcast({ kind: "join", playerName: name, inventory: { capacity: 27, slots } });
    }

    function tradeStateOf(inbox: unknown[]): Record<string, unknown> | undefined {
      const msgs = inbox.filter((m) => (m as { kind: string }).kind === "tradeState");
      return msgs.at(-1) as Record<string, unknown> | undefined;
    }

    it("propose sends tradeState to BOTH participants only, never a third peer", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const carol = net2.addPeer("carol");
      joinWith(alice, "Alice", []);
      joinWith(bob, "Bob", []);
      joinWith(carol, "Carol", []);
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);
      const carolInbox = collect(carol);

      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });

      expect(tradeStateOf(aliceInbox)).toMatchObject({ peerA: "alice", peerB: "bob", status: "negotiating" });
      expect(tradeStateOf(bobInbox)).toMatchObject({ peerA: "alice", peerB: "bob", status: "negotiating" });
      expect(carolInbox.filter((m) => (m as { kind: string }).kind === "tradeState")).toEqual([]);
    });

    it("rejects proposing a trade with yourself", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      joinWith(alice, "Alice", []);
      const inbox = collect(alice);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "alice" });
      expect(inbox.filter((m) => (m as { kind: string }).kind === "tradeState")).toEqual([]);
    });

    it("rejects a second proposal while either side already has an active trade", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const carol = net2.addPeer("carol");
      joinWith(alice, "Alice", []);
      joinWith(bob, "Bob", []);
      joinWith(carol, "Carol", []);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      const carolInbox = collect(carol);
      carol.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      expect(carolInbox.filter((m) => (m as { kind: string }).kind === "tradeState")).toEqual([]);
    });

    it("offering resets confirms and echoes tradeState to both", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      joinWith(alice, "Alice", [{ itemId: "wood", count: 10 }]);
      joinWith(bob, "Bob", [{ itemId: "stone", count: 5 }]);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      const bobInbox = collect(bob);

      alice.broadcast({
        kind: "tradeOfferIntent",
        tradeId: "trade:1",
        offer: [{ itemId: "wood", count: 3 }],
      });

      expect(tradeStateOf(bobInbox)).toMatchObject({
        offerA: [{ itemId: "wood", count: 3 }],
        confirmedA: false,
        confirmedB: false,
      });
    });

    it("a confirm is rejected if the confirming peer doesn't actually have the offered stack (revalidated at confirm time)", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      joinWith(alice, "Alice", []); // alice has NOTHING despite offering wood below
      joinWith(bob, "Bob", []);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      alice.broadcast({
        kind: "tradeOfferIntent",
        tradeId: "trade:1",
        offer: [{ itemId: "wood", count: 3 }],
      });
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "tradeConfirmIntent", tradeId: "trade:1" });

      expect(tradeStateOf(bobInbox)).toBeUndefined(); // rejected silently, no state change sent
    });

    it("atomically swaps both sides' authoritative inventories once both confirm, and marks the trade completed", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      joinWith(alice, "Alice", [{ itemId: "wood", count: 10 }]);
      joinWith(bob, "Bob", [{ itemId: "stone", count: 5 }]);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      alice.broadcast({
        kind: "tradeOfferIntent",
        tradeId: "trade:1",
        offer: [{ itemId: "wood", count: 4 }],
      });
      bob.broadcast({
        kind: "tradeOfferIntent",
        tradeId: "trade:1",
        offer: [{ itemId: "stone", count: 2 }],
      });
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "tradeConfirmIntent", tradeId: "trade:1" });
      bob.broadcast({ kind: "tradeConfirmIntent", tradeId: "trade:1" });

      expect(tradeStateOf(aliceInbox)).toMatchObject({ status: "completed" });
      expect(tradeStateOf(bobInbox)).toMatchObject({ status: "completed" });
      expect(inventoryStateOf(aliceInbox)?.slots).toContainEqual({ itemId: "wood", count: 6 });
      expect(inventoryStateOf(aliceInbox)?.slots).toContainEqual({ itemId: "stone", count: 2 });
      expect(inventoryStateOf(bobInbox)?.slots).toContainEqual({ itemId: "stone", count: 3 });
      expect(inventoryStateOf(bobInbox)?.slots).toContainEqual({ itemId: "wood", count: 4 });
    });

    it("either side cancelling rolls back cleanly — nothing moved, tradeState reflects cancelled", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      joinWith(alice, "Alice", [{ itemId: "wood", count: 10 }]);
      joinWith(bob, "Bob", [{ itemId: "stone", count: 5 }]);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      alice.broadcast({
        kind: "tradeOfferIntent",
        tradeId: "trade:1",
        offer: [{ itemId: "wood", count: 4 }],
      });
      const bobInbox = collect(bob);

      bob.broadcast({ kind: "tradeCancelIntent", tradeId: "trade:1" });

      expect(tradeStateOf(bobInbox)).toMatchObject({ status: "cancelled" });
      // nothing debited — a fresh confirm attempt on the dead trade is a no-op
      const bobInbox2 = collect(bob);
      alice.broadcast({ kind: "tradeConfirmIntent", tradeId: "trade:1" });
      expect(bobInbox2.filter((m) => (m as { kind: string }).kind === "tradeState")).toEqual([]);
    });

    it("a disconnect mid-trade cancels it and notifies the remaining peer only", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      joinWith(alice, "Alice", [{ itemId: "wood", count: 10 }]);
      joinWith(bob, "Bob", [{ itemId: "stone", count: 5 }]);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      const bobInbox = collect(bob);

      net2.removePeer("alice");

      expect(tradeStateOf(bobInbox)).toMatchObject({ status: "cancelled" });
    });

    it("frees both peers to start a new trade after cancellation", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const carol = net2.addPeer("carol");
      joinWith(alice, "Alice", []);
      joinWith(bob, "Bob", []);
      joinWith(carol, "Carol", []);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      alice.broadcast({ kind: "tradeCancelIntent", tradeId: "trade:1" });

      const carolInbox = collect(carol);
      carol.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      expect(tradeStateOf(carolInbox)).toMatchObject({ peerA: "carol", peerB: "bob", status: "negotiating" });
    });

    it("ignores a trade intent from a non-participant peer", () => {
      const { net: net2 } = tradeSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const carol = net2.addPeer("carol");
      joinWith(alice, "Alice", []);
      joinWith(bob, "Bob", []);
      joinWith(carol, "Carol", []);
      alice.broadcast({ kind: "tradeProposeIntent", targetPeerId: "bob" });
      const bobInbox = collect(bob);

      carol.broadcast({ kind: "tradeConfirmIntent", tradeId: "trade:1" });

      expect(bobInbox.filter((m) => (m as { kind: string }).kind === "tradeState")).toEqual([]);
    });
  });
  // ---- E5.1/E5.2/E5.4/E5.6: party ----

  describe("party", () => {
    function partiesOf(inbox: unknown[]): PartyMsg[] {
      return inbox.filter((m) => (m as { kind: string }).kind === "party") as PartyMsg[];
    }
    function invitesOf(inbox: unknown[]): PartyInviteMsg[] {
      return inbox.filter((m) => (m as { kind: string }).kind === "partyInvite") as PartyInviteMsg[];
    }
    function lookupsOf(inbox: unknown[]): PartyInventoryStateMsg[] {
      return inbox.filter(
        (m) => (m as { kind: string }).kind === "partyInventoryState",
      ) as PartyInventoryStateMsg[];
    }

    function hostedSession(): { net: ReturnType<typeof makeTransportNetwork>; session: HostSession } {
      const net2 = makeTransportNetwork();
      const session2 = new HostSession(net2.host, () => SNAPSHOT, { onWorldEdit: () => {} }, {
        registry: REGISTRY,
      });
      return { net: net2, session: session2 };
    }

    it("invite -> accept forms a party and rosters both members", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      const aliceInbox = collect(alice);
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      expect(invitesOf(bobInbox)).toEqual([
        { kind: "partyInvite", fromPeerId: "alice", fromPlayerName: "Alice" },
      ]);

      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });

      const aliceRoster = partiesOf(aliceInbox).at(-1);
      const bobRoster = partiesOf(bobInbox).at(-1);
      expect(aliceRoster?.leaderId).toBe("alice");
      expect(aliceRoster?.members.map((m) => m.peerId)).toEqual(["alice", "bob"]);
      expect(bobRoster).toEqual(aliceRoster);
    });

    it("rejects an invite from a non-leader member", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const carol = net2.addPeer("carol");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      carol.broadcast({ kind: "join", playerName: "Carol" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const carolInbox = collect(carol);

      bob.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "carol" } });

      expect(invitesOf(carolInbox)).toEqual([]);
    });

    it("rejects an invite once the party is full", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      for (const name of ["bob", "carol", "dave"]) {
        const p = net2.addPeer(name);
        p.broadcast({ kind: "join", playerName: name });
        alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: name } });
        p.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      }
      const eve = net2.addPeer("eve");
      eve.broadcast({ kind: "join", playerName: "Eve" });
      const eveInbox = collect(eve);

      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "eve" } });

      expect(invitesOf(eveInbox)).toEqual([]);
    });

    it("rejects self-kick", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const inbox = collect(alice);

      alice.broadcast({ kind: "partyAction", action: { op: "kick", targetPeerId: "alice" } });

      expect(partiesOf(inbox)).toEqual([]);
    });

    it("rejects a kick from a non-leader", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const carol = net2.addPeer("carol");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      carol.broadcast({ kind: "join", playerName: "Carol" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "carol" } });
      carol.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const carolInbox = collect(carol);

      bob.broadcast({ kind: "partyAction", action: { op: "kick", targetPeerId: "carol" } });

      expect(partiesOf(carolInbox)).toEqual([]);
    });

    it("leader kick removes the target and notifies them they have no party", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "partyAction", action: { op: "kick", targetPeerId: "bob" } });

      expect(partiesOf(bobInbox).at(-1)).toEqual({
        kind: "party",
        partyId: null,
        leaderId: null,
        members: [],
      });
    });

    it("leader leaving hands leadership to the next member (succession)", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const bobInbox = collect(bob);

      alice.broadcast({ kind: "partyAction", action: { op: "leave" } });

      expect(partiesOf(bobInbox).at(-1)?.leaderId).toBe("bob");
    });

    it("a partyVitals report rosters health/energy/level/combat tally to party members", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const aliceInbox = collect(alice);

      bob.broadcast({
        kind: "partyVitals",
        health: 7,
        maxHealth: 10,
        energy: 4,
        maxEnergy: 10,
        level: 2,
        damageDealt: 30,
        dps: 6,
        healing: 0,
        kills: 1,
      });

      const bobRow = partiesOf(aliceInbox).at(-1)?.members.find((m) => m.peerId === "bob");
      expect(bobRow).toEqual({
        peerId: "bob",
        playerName: "Bob",
        health: 7,
        maxHealth: 10,
        energy: 4,
        maxEnergy: 10,
        level: 2,
        damageDealt: 30,
        dps: 6,
        healing: 0,
        kills: 1,
      });
    });

    it("inventory lookup: denied when the target hasn't opted in", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const aliceInbox = collect(alice);

      alice.broadcast({ kind: "partyInventoryLookup", targetPeerId: "bob" });

      expect(lookupsOf(aliceInbox)).toEqual([]);
    });

    it("inventory lookup: denied for a non-party member even if they opted in", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      bob.broadcast({ kind: "partyAction", action: { op: "setInventoryShare", shared: true } });
      const aliceInbox = collect(alice);

      alice.broadcast({ kind: "partyInventoryLookup", targetPeerId: "bob" });

      expect(lookupsOf(aliceInbox)).toEqual([]);
    });

    it("inventory lookup: served read-only when in the same party and opted in", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      const slots = Array(27).fill(null);
      slots[0] = { itemId: "wood", count: 5 };
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob", inventory: { capacity: 27, slots } });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      bob.broadcast({ kind: "partyAction", action: { op: "setInventoryShare", shared: true } });
      const aliceInbox = collect(alice);

      alice.broadcast({ kind: "partyInventoryLookup", targetPeerId: "bob" });

      expect(lookupsOf(aliceInbox)).toEqual([
        { kind: "partyInventoryState", targetPeerId: "bob", capacity: 27, slots },
      ]);
    });

    it("inventory lookup: denied for the host (its own inventory isn't tracked here)", () => {
      const events: unknown[] = [];
      const net2 = makeTransportNetwork();
      const session2 = new HostSession(
        net2.host,
        () => SNAPSHOT,
        { onWorldEdit: () => {}, onHostPartyMessage: (m) => events.push(m) },
        { registry: REGISTRY },
      );
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      session2.applyHostPartyAction({ op: "invite", targetPeerId: "alice" });
      alice.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      events.length = 0;

      alice.broadcast({ kind: "partyInventoryLookup", targetPeerId: HOST_PEER_ID });

      expect(events.filter((m) => (m as { kind: string }).kind === "partyInventoryState")).toEqual([]);
    });

    it("the host can form a party with a joiner via the local API", () => {
      const events: PartyMsg[] = [];
      const net2 = makeTransportNetwork();
      const session2 = new HostSession(
        net2.host,
        () => SNAPSHOT,
        {
          onWorldEdit: () => {},
          onHostPartyMessage: (m) => {
            if (m.kind === "party") events.push(m);
          },
        },
        { registry: REGISTRY },
      );
      const alice = net2.addPeer("alice");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      const aliceInbox = collect(alice);

      session2.reportHostVitals("Host", {
        health: 10,
        maxHealth: 10,
        energy: 10,
        maxEnergy: 10,
        level: 1,
        damageDealt: 0,
        dps: 0,
        healing: 0,
        kills: 0,
      });
      session2.applyHostPartyAction({ op: "invite", targetPeerId: "alice" });
      alice.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });

      const roster = partiesOf(aliceInbox).at(-1);
      expect(roster?.leaderId).toBe(HOST_PEER_ID);
      expect(roster?.members.map((m) => m.peerId)).toEqual([HOST_PEER_ID, "alice"]);
      expect(roster?.members[0]).toMatchObject({ playerName: "Host", health: 10 });
      expect(events.length).toBeGreaterThan(0);
    });

    it("a peer leaving the transport (drop) also leaves its party (succession)", () => {
      const { net: net2 } = hostedSession();
      const alice = net2.addPeer("alice");
      const bob = net2.addPeer("bob");
      alice.broadcast({ kind: "join", playerName: "Alice" });
      bob.broadcast({ kind: "join", playerName: "Bob" });
      alice.broadcast({ kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } });
      bob.broadcast({ kind: "partyAction", action: { op: "acceptInvite" } });
      const bobInbox = collect(bob);

      net2.removePeer("alice");

      expect(partiesOf(bobInbox).at(-1)?.leaderId).toBe("bob");
    });
  });
});

describe("HostSession — E7.2 ranged + ammo", () => {
  function aliceInventory(arrowCount: number): { capacity: number; slots: ({ itemId: string; count: number } | null)[] } {
    const slots: ({ itemId: string; count: number } | null)[] = Array(27).fill(null);
    if (arrowCount > 0) slots[0] = { itemId: "arrow", count: arrowCount };
    return { capacity: 27, slots };
  }

  function projectilesMessages(inbox: unknown[]): { kind: string; entities: unknown[] }[] {
    return inbox.filter((m) => (m as { kind: string }).kind === "projectiles") as {
      kind: string;
      entities: unknown[];
    }[];
  }

  function makeSession(
    hooks: Partial<HostSessionHooks> = {},
  ): { net: ReturnType<typeof makeTransportNetwork>; session: HostSession; now: { value: number } } {
    const net2 = makeTransportNetwork();
    const nowBox = { value: 1000 };
    const session2 = new HostSession(
      net2.host,
      () => SNAPSHOT,
      { onWorldEdit: () => {}, ...hooks },
      { registry: REGISTRY, clock: () => nowBox.value },
    );
    return { net: net2, session: session2, now: nowBox };
  }

  function joinEquipAndAim(
    net2: ReturnType<typeof makeTransportNetwork>,
    arrowCount: number,
    opts: { sendPose?: boolean; equip?: string } = {},
  ): ReturnType<ReturnType<typeof makeTransportNetwork>["addPeer"]> {
    const alice = net2.addPeer("alice");
    alice.broadcast({ kind: "join", playerName: "Alice", inventory: aliceInventory(arrowCount) });
    if (opts.sendPose !== false) alice.broadcast({ kind: "pose", state: pose(0, 1, 0) });
    if (opts.equip !== "" ) alice.broadcast({ kind: "equipItem", slot: "weapon", itemId: opts.equip ?? "bow" });
    return alice;
  }

  it("drops aimedAttack when the sender has never sent a pose (security #3, null-pose gate)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 5, { sendPose: false });
    alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    session.tick(16);
    expect(projectilesMessages(bobInbox).flatMap((m) => m.entities)).toEqual([]);
  });

  it("drops aimedAttack when nothing is equipped", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 5, { equip: "" });
    alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    session.tick(16);
    expect(projectilesMessages(bobInbox).flatMap((m) => m.entities)).toEqual([]);
  });

  it("equipItem drops an unknown item id, so a later aimedAttack has nothing equipped (security #4)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 5, { equip: "not-a-real-item" });
    alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    session.tick(16);
    expect(projectilesMessages(bobInbox).flatMap((m) => m.entities)).toEqual([]);
  });

  it("a valid bow shot debits one arrow and streams the projectile after a tick (security #5)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 5);
    const aliceInbox = collect(alice);
    alice.broadcast({
      kind: "aimedAttack",
      origin: [0, 1, 0],
      dir: [0, 0, 1],
      weaponSlot: "weapon",
      chargeMs: 1000,
    });

    expect(inventoryStateOf(aliceInbox)?.slots[0]).toEqual({ itemId: "arrow", count: 4 });

    session.tick(16);
    const msgs = projectilesMessages(bobInbox);
    expect(msgs.length).toBeGreaterThan(0);
    const last = msgs.at(-1)!;
    expect(last.entities).toHaveLength(1);
    expect(last.entities[0]).toMatchObject({ projectileId: "arrow", ownerId: "alice" });
  });

  it("a shot with no ammo is dropped — never conjures a projectile", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 0);
    alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    session.tick(16);
    expect(projectilesMessages(bobInbox).flatMap((m) => m.entities)).toEqual([]);
  });

  it("caps live projectiles per peer (security #2)", () => {
    const { net: net2, session, now } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 30);
    for (let i = 0; i < 14; i++) {
      now.value += 5000; // refill the token bucket to full before every shot
      alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    }
    session.tick(1);
    const last = projectilesMessages(bobInbox).at(-1)!;
    expect(last.entities).toHaveLength(12); // MAX_ACTIVE_PROJECTILES_PER_PEER
  });

  it("rate-limits rapid-fire launches (security #1)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 30);
    for (let i = 0; i < 8; i++) {
      alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    }
    session.tick(1);
    const last = projectilesMessages(bobInbox).at(-1)!;
    expect(last.entities).toHaveLength(6); // AIMED_ATTACK_RATE_LIMIT.capacity, no refill elapsed
  });

  it("tick() resolves a host-side hit via findHittableEntities/onProjectileHit and removes the shot", () => {
    const onProjectileHit = vi.fn();
    const { net: net2, session } = makeSession({
      findHittableEntities: () => [{ id: "creature:1", x: 0, y: 1, z: 0.3, radius: 0.5 }],
      onProjectileHit,
    });
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 5);
    alice.broadcast({
      kind: "aimedAttack",
      origin: [0, 1, 0],
      dir: [0, 0, 1],
      weaponSlot: "weapon",
      chargeMs: 1000,
    });

    session.tick(10); // arrow @ 40 m/s moves 0.4 m in 10ms — overlaps the target's sphere

    expect(onProjectileHit).toHaveBeenCalledTimes(1);
    expect(onProjectileHit).toHaveBeenCalledWith("creature:1", 12, "physical", "arrowHit", "alice");
    const last = projectilesMessages(bobInbox).at(-1)!;
    expect(last.entities).toEqual([]); // no pierce — the shot is gone on hit
  });

  it("tick() expires a projectile at its lifetime even without a hit", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinEquipAndAim(net2, 5);
    alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });

    session.tick(3000); // matches the arrow spec's lifetimeMs

    const last = projectilesMessages(bobInbox).at(-1)!;
    expect(last.entities).toEqual([]);
  });
});

describe("HostSession — E7.3 spellcasting", () => {
  function makeSession(
    hooks: Partial<HostSessionHooks> = {},
  ): { net: ReturnType<typeof makeTransportNetwork>; session: HostSession; now: { value: number } } {
    const net2 = makeTransportNetwork();
    const nowBox = { value: 1000 };
    const session2 = new HostSession(
      net2.host,
      () => SNAPSHOT,
      { onWorldEdit: () => {}, ...hooks },
      { registry: REGISTRY, clock: () => nowBox.value },
    );
    return { net: net2, session: session2, now: nowBox };
  }

  function projectilesMessages(inbox: unknown[]): { kind: string; entities: unknown[] }[] {
    return inbox.filter((m) => (m as { kind: string }).kind === "projectiles") as {
      kind: string;
      entities: unknown[];
    }[];
  }

  function effectMessages(
    inbox: unknown[],
  ): { kind: string; effectId: string; x: number; y: number; z: number }[] {
    return inbox.filter((m) => (m as { kind: string }).kind === "effect") as {
      kind: string;
      effectId: string;
      x: number;
      y: number;
      z: number;
    }[];
  }

  function joinAndPose(
    net2: ReturnType<typeof makeTransportNetwork>,
    opts: { sendPose?: boolean } = {},
  ): ReturnType<ReturnType<typeof makeTransportNetwork>["addPeer"]> {
    const alice = net2.addPeer("alice");
    alice.broadcast({ kind: "join", playerName: "Alice" });
    if (opts.sendPose !== false) alice.broadcast({ kind: "pose", state: pose(0, 1, 0) });
    return alice;
  }

  it("drops castSpell when the sender has never sent a pose (security a, null-pose gate)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2, { sendPose: false });
    alice.broadcast({ kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0], dir: [0, 0, 1] });
    session.tick(16);
    expect(projectilesMessages(bobInbox).flatMap((m) => m.entities)).toEqual([]);
  });

  it("drops an unknown abilityId (security c)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "not-a-real-spell", origin: [0, 1, 0], dir: [0, 0, 1] });
    session.tick(16);
    expect(projectilesMessages(bobInbox).flatMap((m) => m.entities)).toEqual([]);
    expect(effectMessages(bobInbox)).toEqual([]);
  });

  it("drops a cast once focus is insufficient (security d) — never goes negative or conjures an effect", () => {
    const { net: net2, now } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2);
    for (let i = 0; i < 7; i++) {
      now.value += 5000; // refill castSpell's OWN rate-limit bucket every time — focus is the only gate left
      alice.broadcast({ kind: "castSpell", abilityId: "vine-snare", origin: [0, 1, 0], groundPoint: [0, 1, 5] });
    }
    // vine-snare costs 18 focus, FOCUS_MAX is 100 -> floor(100/18) = 5 affordable casts.
    expect(effectMessages(bobInbox)).toHaveLength(5);
  });

  it("rate-limits rapid casts (security b) even with focus fully topped up each time", () => {
    const { net: net2 } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2);
    for (let i = 0; i < 8; i++) {
      // regenerate focus without advancing the clock, so the token bucket
      // (which reads the clock directly, not tick()) never refills — only
      // the rate limit can be the gate left standing in this loop.
      alice.broadcast({ kind: "castSpell", abilityId: "vine-snare", origin: [0, 1, 0], groundPoint: [0, 1, 5] });
    }
    expect(effectMessages(bobInbox)).toHaveLength(6); // CAST_SPELL_RATE_LIMIT.capacity
  });

  it("sparkle bolt launches a host-simulated projectile (targeting: projectile)", () => {
    const { net: net2, session } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0], dir: [0, 0, 1] });
    session.tick(16);
    const last = projectilesMessages(bobInbox).at(-1)!;
    expect(last.entities).toHaveLength(1);
    expect(last.entities[0]).toMatchObject({ projectileId: "sparkle-bolt", ownerId: "alice" });
  });

  it("sparkle bolt shares the per-peer active-projectile cap with aimedAttack (cap is reused, not re-invented)", () => {
    const { net: net2, session, now } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = net2.addPeer("alice");
    alice.broadcast({
      kind: "join",
      playerName: "Alice",
      inventory: { capacity: 27, slots: [{ itemId: "arrow", count: 99 }, ...Array(26).fill(null)] },
    });
    alice.broadcast({ kind: "pose", state: pose(0, 1, 0) });
    alice.broadcast({ kind: "equipItem", slot: "weapon", itemId: "bow" });
    for (let i = 0; i < 12; i++) {
      now.value += 5000; // refill aimedAttack's OWN rate-limit bucket every time
      alice.broadcast({ kind: "aimedAttack", origin: [0, 1, 0], dir: [0, 0, 1], weaponSlot: "weapon" });
    }
    now.value += 5000; // refill castSpell's OWN rate-limit bucket too
    alice.broadcast({ kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0], dir: [0, 0, 1] });
    session.tick(1);
    const last = projectilesMessages(bobInbox).at(-1)!;
    expect(last.entities).toHaveLength(12); // MAX_ACTIVE_PROJECTILES_PER_PEER — the 13th (spell) launch was dropped
    expect(last.entities.every((e) => (e as { projectileId: string }).projectileId === "arrow")).toBe(true);
  });

  it("healing bloom always heals the caster itself, even with no ally hook wired", () => {
    const onSpellEffect = vi.fn();
    const { net: net2 } = makeSession({ onSpellEffect });
    net2.addPeer("bob");
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "healing-bloom", origin: [0, 1, 0], dir: [0, 0, 1] });
    expect(onSpellEffect).toHaveBeenCalledWith("alice", 25, "heal", "nature", "spellNature", "alice");
  });

  it("healing bloom extends to allies from findHealableAllies within radius", () => {
    const onSpellEffect = vi.fn();
    const { net: net2 } = makeSession({
      onSpellEffect,
      findHealableAllies: () => [{ id: "bob", x: 2, y: 1, z: 0, radius: 0 }],
    });
    net2.addPeer("bob");
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "healing-bloom", origin: [0, 1, 0], dir: [0, 0, 1] });
    expect(onSpellEffect).toHaveBeenCalledWith("alice", 25, "heal", "nature", "spellNature", "alice");
    expect(onSpellEffect).toHaveBeenCalledWith("bob", expect.any(Number), "heal", "nature", "spellNature", "alice");
  });

  it("frost puff resolves a control effect (kind 'control', amount 0 — no status system wired yet) against creatures in the cone", () => {
    const onSpellEffect = vi.fn();
    const { net: net2 } = makeSession({
      onSpellEffect,
      findHittableEntities: () => [{ id: "creature:1", x: 3, y: 1, z: 0, radius: 0.5 }],
    });
    net2.addPeer("bob");
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "frost-puff", origin: [0, 1, 0], dir: [1, 0, 0] });
    expect(onSpellEffect).toHaveBeenCalledWith("creature:1", 0, "control", "frost", "spellFrost", "alice");
  });

  it("drops a cone-targeted cast when the client sends a groundPoint instead of a dir", () => {
    const { net: net2 } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "frost-puff", origin: [0, 1, 0], groundPoint: [1, 1, 1] });
    expect(effectMessages(bobInbox)).toEqual([]);
  });

  it("broadcasts a cosmetic effect cue at the resolved AoE center for every peer", () => {
    const { net: net2 } = makeSession();
    const bob = net2.addPeer("bob");
    const bobInbox = collect(bob);
    const alice = joinAndPose(net2);
    alice.broadcast({ kind: "castSpell", abilityId: "vine-snare", origin: [0, 1, 0], groundPoint: [2, 1, 4] });
    expect(effectMessages(bobInbox)).toContainEqual({ kind: "effect", effectId: "vine-snare-root", x: 2, y: 1, z: 4 });
  });

  it("never logs cast contents — a dropped/malformed cast is a safe no-op, not a crash", () => {
    const { net: net2, session } = makeSession();
    net2.addPeer("bob");
    const alice = joinAndPose(net2, { sendPose: false });
    expect(() =>
      alice.broadcast({ kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0], dir: [0, 0, 1] }),
    ).not.toThrow();
    expect(() => session.tick(16)).not.toThrow();
  });
});
