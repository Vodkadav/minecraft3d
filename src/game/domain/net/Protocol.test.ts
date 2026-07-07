import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import { parseMessage, type NetMessage } from "./Protocol";

import type { PlayerState } from "../world/WorldSaveData";

const POSE: PlayerState = { position: [1, 2, 3], yaw: 0.5, pitch: -0.2 };

const HAPPY: NetMessage[] = [
  { kind: "join", playerName: "Luna" },
  { kind: "pose", state: POSE },
  { kind: "dig", x: 1, y: 2, z: 3, radius: 1.5 },
  { kind: "fill", x: 1, y: 2, z: 3, radius: 1.5, materialId: 4 },
  { kind: "interact", action: "attack", targetId: "creature:7" },
  {
    kind: "welcome",
    seed: 123,
    worldId: "w1",
    name: "Home",
    modifiedChunks: [{ key: "0,0,0", rev: 1, data: new Uint8Array([1, 2]) }],
    entities: { "e:1": { hp: 5 } },
  },
  { kind: "peerPose", peerId: "p1", state: POSE },
  { kind: "worldEdit", edit: { op: "dig", x: 1, y: 2, z: 3, radius: 1 } },
  { kind: "worldEdit", edit: { op: "fill", x: 1, y: 2, z: 3, radius: 1, materialId: 2 } },
  { kind: "entityRemoved", id: "e:1" },
  {
    kind: "creatures",
    entities: [
      { id: "spawn:1", species: "deer", kind: "creature", x: 1, y: 2, z: 3, yaw: 0.5 },
      { id: "spawn:2", species: "stone-node", kind: "node", x: 4, y: 5, z: 6, yaw: 0 },
      {
        id: "spawn:3",
        species: "wolf",
        kind: "creature",
        x: 0,
        y: 0,
        z: 0,
        yaw: 1,
        behavior: "flee",
        health: 12,
      },
    ],
  },
  { kind: "creatures", entities: [] },
  { kind: "peerJoined", peerId: "p2", playerName: "Andrea" },
  { kind: "peerLeft", peerId: "p2" },
  { kind: "hostClosing" },
];

describe("parseMessage — happy paths", () => {
  it.each(HAPPY.map((m) => [m.kind, m] as const))("parses %s", (_kind, msg) => {
    const r = parseMessage(msg);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toEqual(msg);
  });
});

describe("parseMessage — malformed input is an error value", () => {
  const BAD: unknown[] = [
    null,
    undefined,
    42,
    "join",
    [],
    {},
    { kind: "teleportEveryone" },
    { kind: "join" }, // missing playerName
    { kind: "join", playerName: 7 }, // wrong type
    { kind: "pose", state: { position: [1, 2], yaw: 0, pitch: 0 } }, // short position
    { kind: "pose", state: { position: [1, 2, "3"], yaw: 0, pitch: 0 } },
    { kind: "dig", x: 1, y: 2, z: 3 }, // missing radius
    { kind: "fill", x: 1, y: 2, z: 3, radius: 1 }, // missing materialId
    { kind: "interact", action: "dance", targetId: "e:1" }, // unknown action
    { kind: "welcome", seed: 1, worldId: "w", name: "n", modifiedChunks: "nope", entities: {} },
    { kind: "welcome", seed: 1, worldId: "w", name: "n", modifiedChunks: [{ key: 1 }], entities: {} },
    { kind: "worldEdit", edit: { op: "nuke", x: 0, y: 0, z: 0, radius: 1 } },
    { kind: "worldEdit", edit: { op: "fill", x: 0, y: 0, z: 0, radius: 1 } }, // fill needs materialId
    { kind: "peerPose", peerId: "p1" }, // missing state
    { kind: "peerLeft" }, // missing peerId
    { kind: "creatures" }, // missing entities
    { kind: "creatures", entities: {} }, // not an array
    { kind: "creatures", entities: [{ id: "x", species: "deer", kind: "creature" }] }, // no coords
    {
      kind: "creatures",
      entities: [{ id: "x", species: "deer", kind: "creature", x: 1, y: 2, z: "3", yaw: 0 }],
    }, // z wrong type
  ];

  it.each(BAD.map((m) => [JSON.stringify(m) ?? String(m), m] as const))(
    "rejects %s",
    (_label, raw) => {
      const r = parseMessage(raw);
      expect(isErr(r)).toBe(true);
      if (isErr(r)) expect(r.error.kind).toBe("MalformedMessage");
    },
  );

  it("never throws on garbage", () => {
    expect(() => parseMessage(Symbol("x"))).not.toThrow();
    expect(() => parseMessage(() => 0)).not.toThrow();
  });
});
