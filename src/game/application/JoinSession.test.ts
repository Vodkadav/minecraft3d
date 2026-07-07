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

  it("sendInteract reaches the host's onInteract hook", () => {
    const net = makeTransportNetwork();
    const interacts: Array<[string, string]> = [];
    new HostSession(net.host, () => SNAPSHOT, {
      onWorldEdit: () => {},
      onInteract: (action, targetId) => interacts.push([action, targetId]),
    });
    const alice = new JoinSession(net.addPeer("alice"), "Alice", {});

    alice.sendInteract("attack", "spawn:7");

    expect(interacts).toEqual([["attack", "spawn:7"]]);
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

  it("ignores malformed traffic with a warning instead of crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const net = makeTransportNetwork();
    new JoinSession(net.addPeer("alice"), "Alice", {});
    expect(() => net.host.send("alice", { kind: "gibberish" })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
