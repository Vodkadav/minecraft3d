// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Group, Mesh, MeshStandardMaterial } from "three";
import type { PlayerState } from "../game/domain/world/WorldSaveData";
import { RemotePlayers } from "./RemotePlayers";

function pose(x: number, y: number, z: number, yaw = 0): PlayerState {
  return { position: [x, y, z], yaw, pitch: 0 };
}

describe("RemotePlayers", () => {
  it("mounts a named group under the parent", () => {
    const parent = new Group();
    new RemotePlayers(parent);
    expect(parent.getObjectByName("remote-players")).toBeTruthy();
  });

  it("upsert creates one avatar per peer, placed at the first pose immediately", () => {
    const parent = new Group();
    const players = new RemotePlayers(parent);
    players.upsert("alice", pose(10, 20, 30));
    players.upsert("alice", pose(11, 20, 30));
    players.upsert("bob", pose(-5, 2, 8));

    expect(players.count).toBe(2);
    const group = parent.getObjectByName("remote-players") as Group;
    expect(group.children).toHaveLength(2);
    const bob = group.children.find((c) => c.name === "bob");
    expect(bob?.position.x).toBeCloseTo(-5);
    expect(bob?.position.z).toBeCloseTo(8);
  });

  it("update lerps toward the latest pose without snapping", () => {
    const parent = new Group();
    const players = new RemotePlayers(parent);
    players.upsert("alice", pose(0, 0, 0));
    players.upsert("alice", pose(10, 0, 0));

    const group = parent.getObjectByName("remote-players") as Group;
    const avatar = group.children[0];
    expect(avatar.position.x).toBe(0); // no snap on upsert

    players.update(0.05);
    expect(avatar.position.x).toBeGreaterThan(0);
    expect(avatar.position.x).toBeLessThan(10);

    for (let i = 0; i < 100; i++) players.update(0.1);
    expect(avatar.position.x).toBeCloseTo(10, 2);
  });

  it("remove and dispose tear avatars down", () => {
    const parent = new Group();
    const players = new RemotePlayers(parent);
    players.upsert("alice", pose(0, 0, 0));
    players.upsert("bob", pose(1, 1, 1));

    players.remove("alice");
    expect(players.count).toBe(1);

    players.dispose();
    expect(players.count).toBe(0);
    expect(parent.getObjectByName("remote-players")).toBeUndefined();
  });

  it("gives each peer its own material color", () => {
    const parent = new Group();
    const players = new RemotePlayers(parent);
    players.upsert("alice", pose(0, 0, 0));
    players.upsert("bob", pose(1, 1, 1));
    const group = parent.getObjectByName("remote-players") as Group;
    const [a, b] = group.children as Mesh[];
    const colorOf = (m: Mesh): number =>
      (m.material as MeshStandardMaterial).color.getHex();
    expect(colorOf(a)).not.toBe(colorOf(b));
  });
});
