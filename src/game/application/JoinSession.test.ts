import { describe, expect, it, vi } from "vitest";
import type { PlayerState } from "../domain/world/WorldSaveData";
import type { WelcomeMsg, WorldEdit } from "../domain/net/Protocol";
import { HostSession, type WorldSnapshot } from "./HostSession";
import { JoinSession } from "./JoinSession";
import { makeTransportNetwork } from "./testing/InMemoryTransportPair";

const SNAPSHOT: WorldSnapshot = {
  seed: 99,
  worldId: "w9",
  name: "Shared World",
  modifiedChunks: [],
  entities: {},
};

function pose(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], yaw: 1, pitch: 0 };
}

function makeHostedNetwork() {
  const net = makeTransportNetwork();
  const edits: WorldEdit[] = [];
  let now = 1000;
  new HostSession(
    net.host,
    () => SNAPSHOT,
    { onWorldEdit: (e) => edits.push(e) },
    { clock: () => now },
  );
  return { net, edits, tick: (ms: number) => (now += ms) };
}

describe("JoinSession", () => {
  it("sends join on start and receives the welcome snapshot", () => {
    const { net } = makeHostedNetwork();
    const onWelcome = vi.fn();
    new JoinSession(net.addPeer("alice"), "Alice", { onWelcome });

    expect(onWelcome).toHaveBeenCalledExactlyOnceWith({
      kind: "welcome",
      ...SNAPSHOT,
    } satisfies WelcomeMsg);
  });

  it("sendPose reaches the other joiner as a peerPose", () => {
    const { net, tick } = makeHostedNetwork();
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {});
    const onPeerPose = vi.fn();
    new JoinSession(net.addPeer("bob"), "Bob", { onPeerPose });

    tick(100);
    alice.sendPose(pose(1, 2, 3));

    expect(onPeerPose).toHaveBeenCalledExactlyOnceWith("alice", pose(1, 2, 3));
  });

  it("sendDig applies on the host and comes back as a worldEdit", () => {
    const { net, edits } = makeHostedNetwork();
    const onWorldEdit = vi.fn();
    const alice = new JoinSession(net.addPeer("alice"), "Alice", { onWorldEdit });

    alice.sendDig(1, 2, 3, 1.5);

    const edit: WorldEdit = { op: "dig", x: 1, y: 2, z: 3, radius: 1.5 };
    expect(edits).toEqual([edit]);
    expect(onWorldEdit).toHaveBeenCalledExactlyOnceWith(edit);
  });

  it("sendFill carries the materialId", () => {
    const { net, edits } = makeHostedNetwork();
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {});
    alice.sendFill(1, 2, 3, 1, 4);
    expect(edits).toEqual([{ op: "fill", x: 1, y: 2, z: 3, radius: 1, materialId: 4 }]);
  });

  it("surfaces a host creatures snapshot via onCreatures", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} });
    const onCreatures = vi.fn();
    new JoinSession(net.addPeer("alice"), "Alice", { onCreatures });

    const entities = [
      { id: "spawn:1", species: "deer", kind: "creature", x: 1, y: 0, z: 2, yaw: 0.3 },
    ];
    net.host.send("alice", { kind: "creatures", entities });

    expect(onCreatures).toHaveBeenCalledExactlyOnceWith(entities);
  });

  it("surfaces a host groundItems snapshot via onGroundItems", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} });
    const onGroundItems = vi.fn();
    new JoinSession(net.addPeer("alice"), "Alice", { onGroundItems });

    const entities = [{ id: "loot:1", itemId: "wood", count: 3, x: 1, y: 0, z: 2 }];
    net.host.send("alice", { kind: "groundItems", entities });

    expect(onGroundItems).toHaveBeenCalledExactlyOnceWith(entities);
  });

  it("sendInteract reaches the host's onInteract hook, tagged with the sender", () => {
    const net = makeTransportNetwork();
    const interacts: Array<[string, string, string]> = [];
    new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onInteract: (action, targetId, peerId) => interacts.push([action, targetId, peerId]),
    });
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {});

    alice.sendInteract("attack", "spawn:7");
    alice.sendInteract("mount", "spawn:9");
    alice.sendInteract("dismount", "spawn:9");

    expect(interacts).toEqual([
      ["attack", "spawn:7", "alice"],
      ["mount", "spawn:9", "alice"],
      ["dismount", "spawn:9", "alice"],
    ]);
  });

  it("sendPlaceableInteract reaches the host's onPlaceableInteract hook, tagged with the sender", () => {
    const net = makeTransportNetwork();
    const calls: Array<[string, string, string, string | undefined, number | undefined]> = [];
    new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: (action, placeableId, peerId, itemId, count) => {
        calls.push([action, placeableId, peerId, itemId, count]);
        return { state: { resolved: true } };
      },
    });
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {});

    alice.sendPlaceableInteract("toggleDoor", "piece:1");
    // this HostSession has no registry (E0.4 default: empty), so the debit
    // step for depositChest fails closed — the hook is never reached, same
    // observable outcome as the old wire-level gate, different reason now.
    alice.sendPlaceableInteract("depositChest", "piece:2", "wood", 4);

    expect(calls).toEqual([["toggleDoor", "piece:1", "alice", undefined, undefined]]);
  });

  it("surfaces the host's resolved placeable state via onPlaceableState", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: () => ({ state: { open: true } }),
    });
    const onPlaceableState = vi.fn();
    const alice = new JoinSession(net.addPeer("alice"), "Alice", { onPlaceableState });

    alice.sendPlaceableInteract("toggleDoor", "piece:1");

    expect(onPlaceableState).toHaveBeenCalledExactlyOnceWith("piece:1", { open: true });
  });

  it("surfaces peerJoined and peerLeft", () => {
    const { net } = makeHostedNetwork();
    const onPeerJoined = vi.fn();
    const onPeerLeft = vi.fn();
    new JoinSession(net.addPeer("alice"), "Alice", { onPeerJoined, onPeerLeft });

    new JoinSession(net.addPeer("bob"), "Bob", {});
    net.removePeer("bob");

    expect(onPeerJoined).toHaveBeenCalledExactlyOnceWith("bob", "Bob");
    expect(onPeerLeft).toHaveBeenCalledExactlyOnceWith("bob");
  });

  it("surfaces hostClosing when the host session closes", () => {
    const net = makeTransportNetwork();
    const host = new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} });
    const onHostClosing = vi.fn();
    new JoinSession(net.addPeer("alice"), "Alice", { onHostClosing });

    host.close();

    expect(onHostClosing).toHaveBeenCalledOnce();
  });

  it("drops host-authoritative kinds arriving from a non-host peer (mesh hardening)", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onPlaceableInteract: () => ({ state: { open: true } }),
    });
    const onWelcome = vi.fn();
    const onWorldEdit = vi.fn();
    const onPlaceableState = vi.fn();
    const onHostClosing = vi.fn();
    new JoinSession(net.addPeer("alice"), "Alice", {
      onWelcome,
      onWorldEdit,
      onPlaceableState,
      onHostClosing,
    });
    expect(onWelcome).toHaveBeenCalledOnce(); // pinned the real host

    const mallory = net.addPeer("mallory"); // raw transport, no JoinSession
    net.linkPeers("mallory", "alice");
    mallory.broadcast({ kind: "welcome", ...SNAPSHOT });
    mallory.broadcast({ kind: "worldEdit", edit: { op: "dig", x: 0, y: 0, z: 0, radius: 1 } });
    mallory.broadcast({ kind: "placeableState", placeableId: "piece:1", state: { open: true } });
    mallory.broadcast({ kind: "hostClosing" });

    expect(onWelcome).toHaveBeenCalledOnce(); // mallory's fake welcome ignored
    expect(onWorldEdit).not.toHaveBeenCalled();
    expect(onPlaceableState).not.toHaveBeenCalled();
    expect(onHostClosing).not.toHaveBeenCalled();
  });

  it("a party roster reaches both members after invite + accept, and vitals ride sendPartyVitals", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} });
    const aliceRosters: Array<{ leaderId: string | null; members: readonly { peerId: string }[] }> = [];
    const bobRosters: Array<{ leaderId: string | null; members: readonly { peerId: string }[] }> = [];
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {
      onParty: (m) => aliceRosters.push(m),
    });
    const bob = new JoinSession(net.addPeer("bob"), "Bob", { onParty: (m) => bobRosters.push(m) });

    alice.sendPartyAction({ op: "invite", targetPeerId: "bob" });
    bob.sendPartyAction({ op: "acceptInvite" });
    alice.sendPartyVitals({
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

    expect(aliceRosters.at(-1)?.leaderId).toBe("alice");
    expect(aliceRosters.at(-1)?.members.map((m) => m.peerId)).toEqual(["alice", "bob"]);
    expect(bobRosters.at(-1)).toEqual(aliceRosters.at(-1));
  });

  it("surfaces an incoming party invite via onPartyInvite", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} });
    const onPartyInvite = vi.fn();
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {});
    new JoinSession(net.addPeer("bob"), "Bob", { onPartyInvite });

    alice.sendPartyAction({ op: "invite", targetPeerId: "bob" });

    expect(onPartyInvite).toHaveBeenCalledExactlyOnceWith({
      kind: "partyInvite",
      fromPeerId: "alice",
      fromPlayerName: "Alice",
    });
  });

  it("sendPartyInventoryLookup is denied silently when the target hasn't opted in", () => {
    const net = makeTransportNetwork();
    new HostSession(net.host, () => SNAPSHOT, { onWorldEdit: () => {} });
    const onPartyInventoryState = vi.fn();
    const alice = new JoinSession(net.addPeer("alice"), "Alice", { onPartyInventoryState });
    const bob = new JoinSession(net.addPeer("bob"), "Bob", {});
    alice.sendPartyAction({ op: "invite", targetPeerId: "bob" });
    bob.sendPartyAction({ op: "acceptInvite" });

    alice.sendPartyInventoryLookup("bob");

    expect(onPartyInventoryState).not.toHaveBeenCalled();
  });

  it("ignores malformed traffic with a warning instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const net = makeTransportNetwork();
    new JoinSession(net.addPeer("alice"), "Alice", {});
    expect(() => net.host.send("alice", { kind: "gibberish" })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
