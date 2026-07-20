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
  { kind: "interact", action: "mount", targetId: "creature:7" },
  { kind: "interact", action: "dismount", targetId: "creature:7" },
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
      {
        id: "spawn:4",
        species: "wolf",
        kind: "creature",
        x: 0,
        y: 0,
        z: 0,
        yaw: 1,
        dying: true,
      },
      {
        id: "spawn:5",
        species: "deer",
        kind: "creature",
        x: 0,
        y: 0,
        z: 0,
        yaw: 1,
        tamed: true,
      },
    ],
  },
  { kind: "creatures", entities: [] },
  { kind: "interact", action: "pickup", targetId: "loot:1" },
  {
    kind: "groundItems",
    entities: [{ id: "loot:1", itemId: "wood", count: 3, x: 1, y: 2, z: 3 }],
  },
  { kind: "groundItems", entities: [] },
  { kind: "peerJoined", peerId: "p2", playerName: "Andrea" },
  { kind: "peerLeft", peerId: "p2" },
  { kind: "hostClosing" },
  { kind: "placeableInteract", action: "toggleDoor", placeableId: "piece:1" },
  {
    kind: "placeableInteract",
    action: "depositChest",
    placeableId: "piece:2",
    itemId: "wood",
    count: 4,
  },
  { kind: "placeableInteract", action: "plantCrop", placeableId: "piece:3", itemId: "wheat-seed" },
  { kind: "placeableState", placeableId: "piece:1", state: { open: true, ownerId: null, locked: false } },
  { kind: "placeableState", placeableId: "piece:2", state: null },
  {
    kind: "join",
    playerName: "Luna",
    inventory: { capacity: 2, slots: [{ itemId: "wood", count: 4 }, null] },
  },
  { kind: "inventoryOp", inventoryOp: { op: "move", from: 0, to: 1 } },
  { kind: "inventoryOp", inventoryOp: { op: "split", from: 0, count: 4 } },
  { kind: "inventoryOp", inventoryOp: { op: "use", index: 2 } },
  {
    kind: "inventoryOp",
    inventoryOp: { op: "deposit", placeableId: "piece:2", itemId: "wood", count: 4 },
  },
  {
    kind: "inventoryOp",
    inventoryOp: { op: "withdraw", placeableId: "piece:2", itemId: "wood", count: 4 },
  },
  { kind: "inventoryState", capacity: 2, slots: [{ itemId: "wood", count: 4 }, null] },
  { kind: "inventoryState", capacity: 0, slots: [] },
  { kind: "chat", channel: "say", text: "hello there!" },
  { kind: "chat", channel: "party", text: "hi team" },
  {
    kind: "chatMessage",
    senderPeerId: "p1",
    senderName: "Luna",
    text: "hello there!",
    channel: "say",
    timestamp: 1000,
  },
  { kind: "tradeProposeIntent", targetPeerId: "bob" },
  { kind: "tradeOfferIntent", tradeId: "trade:1", offer: [{ itemId: "wood", count: 4 }] },
  { kind: "tradeOfferIntent", tradeId: "trade:1", offer: [] },
  { kind: "tradeConfirmIntent", tradeId: "trade:1" },
  { kind: "tradeCancelIntent", tradeId: "trade:1" },
  {
    kind: "tradeState",
    tradeId: "trade:1",
    peerA: "alice",
    peerB: "bob",
    offerA: [{ itemId: "wood", count: 4 }],
    offerB: [],
    confirmedA: true,
    confirmedB: false,
    status: "negotiating",
  },
  { kind: "partyAction", action: { op: "invite", targetPeerId: "bob" } },
  { kind: "partyAction", action: { op: "acceptInvite" } },
  { kind: "partyAction", action: { op: "declineInvite" } },
  { kind: "partyAction", action: { op: "leave" } },
  { kind: "partyAction", action: { op: "kick", targetPeerId: "bob" } },
  { kind: "partyAction", action: { op: "setInventoryShare", shared: true } },
  {
    kind: "partyVitals",
    health: 8,
    maxHealth: 10,
    energy: 5,
    maxEnergy: 10,
    level: 3,
    damageDealt: 40,
    dps: 12.5,
    healing: 0,
    kills: 1,
  },
  { kind: "partyInventoryLookup", targetPeerId: "bob" },
  {
    kind: "party",
    partyId: "party-1",
    leaderId: "alice",
    members: [
      {
        peerId: "alice",
        playerName: "Alice",
        health: 10,
        maxHealth: 10,
        energy: 10,
        maxEnergy: 10,
        level: 1,
        damageDealt: 0,
        dps: 0,
        healing: 0,
        kills: 0,
      },
    ],
  },
  { kind: "party", partyId: null, leaderId: null, members: [] },
  { kind: "partyInvite", fromPeerId: "alice", fromPlayerName: "Alice" },
  {
    kind: "partyInventoryState",
    targetPeerId: "bob",
    capacity: 2,
    slots: [{ itemId: "wood", count: 4 }, null],
  },
  // ---- E7.0 combat contracts ----
  { kind: "equipItem", slot: "weapon", itemId: "iron-sword" },
  { kind: "equipItem", slot: "spell", itemId: "sparkle-bolt" },
  { kind: "aimedAttack", origin: [1, 2, 3], dir: [0, 0, 1], weaponSlot: "weapon" },
  { kind: "aimedAttack", origin: [1, 2, 3], dir: [0.577, 0.577, 0.577], weaponSlot: "spell" },
  { kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0], dir: [1, 0, 0] },
  { kind: "castSpell", abilityId: "vine-snare", origin: [0, 1, 0], groundPoint: [5, 0, 5] },
  { kind: "deployItem", deployableId: "bumble-trap", position: [3, 0, 3] },
  {
    kind: "projectiles",
    entities: [
      {
        id: "proj:1",
        projectileId: "arrow",
        ownerId: "p1",
        x: 1,
        y: 2,
        z: 3,
        dirX: 0,
        dirY: 0,
        dirZ: 1,
      },
    ],
  },
  { kind: "projectiles", entities: [] },
  {
    kind: "deployables",
    entities: [
      { id: "dep:1", deployableId: "bumble-trap", ownerId: "p1", x: 1, y: 0, z: 2, armed: true },
    ],
  },
  { kind: "deployables", entities: [] },
  { kind: "effect", effectId: "boom", x: 1, y: 2, z: 3 },
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
    {
      kind: "creatures",
      entities: [
        { id: "x", species: "deer", kind: "creature", x: 1, y: 2, z: 3, yaw: 0, dying: "yes" },
      ],
    }, // dying wrong type
    {
      kind: "creatures",
      entities: [
        { id: "x", species: "deer", kind: "creature", x: 1, y: 2, z: 3, yaw: 0, tamed: "yes" },
      ],
    }, // tamed wrong type
    { kind: "groundItems" }, // missing entities
    { kind: "groundItems", entities: {} }, // not an array
    { kind: "groundItems", entities: [{ id: "loot:1", itemId: "wood", count: 3, x: 1, y: 2 }] }, // no z
    { kind: "groundItems", entities: [{ id: "", itemId: "wood", count: 3, x: 1, y: 2, z: 3 }] }, // empty id
    { kind: "groundItems", entities: [{ id: "loot:1", itemId: "wood", count: 0, x: 1, y: 2, z: 3 }] }, // non-positive count
    {
      kind: "groundItems",
      entities: [{ id: "loot:1", itemId: "wood", count: 1000, x: 1, y: 2, z: 3 }],
    }, // oversized count
    {
      kind: "groundItems",
      entities: Array.from({ length: 300 }, (_, i) => ({
        id: `loot:${i}`,
        itemId: "wood",
        count: 1,
        x: 0,
        y: 0,
        z: 0,
      })),
    }, // oversized array (DoS-shaped payload)
    { kind: "placeableInteract", action: "danceOnChest", placeableId: "piece:1" }, // unknown action
    { kind: "placeableInteract", action: "toggleDoor" }, // missing placeableId
    { kind: "placeableInteract", action: "toggleDoor", placeableId: 7 }, // wrong type
    { kind: "placeableInteract", action: "depositChest", placeableId: "p:1", itemId: 5 }, // wrong type
    { kind: "placeableInteract", action: "depositChest", placeableId: "p:1", count: "4" }, // wrong type
    { kind: "placeableState", state: {} }, // missing placeableId
    { kind: "placeableState", placeableId: 7, state: {} }, // wrong type
    { kind: "placeableState", placeableId: "p:1" }, // missing state key entirely
    { kind: "join", playerName: "Luna", inventory: { capacity: 1, slots: [] } }, // slots length mismatch
    {
      kind: "join",
      playerName: "Luna",
      inventory: { capacity: 1, slots: [{ itemId: "", count: 1 }] },
    }, // empty itemId
    {
      kind: "join",
      playerName: "Luna",
      inventory: { capacity: 1, slots: [{ itemId: "wood", count: 0 }] },
    }, // non-positive count
    {
      kind: "join",
      playerName: "Luna",
      inventory: { capacity: 1, slots: [{ itemId: "wood", count: 1.5 }] },
    }, // non-integer count
    {
      kind: "join",
      playerName: "Luna",
      inventory: { capacity: 1, slots: [{ itemId: "wood", count: 1000 }] },
    }, // oversized count
    { kind: "join", playerName: "Luna", inventory: { capacity: -1, slots: [] } }, // negative capacity
    { kind: "join", playerName: "Luna", inventory: { capacity: 1, slots: "nope" } }, // slots not an array
    { kind: "inventoryOp" }, // missing inventoryOp
    { kind: "inventoryOp", inventoryOp: { op: "teleportItem", from: 0, to: 1 } }, // unknown op
    { kind: "inventoryOp", inventoryOp: { op: "move", from: 0 } }, // missing `to`
    { kind: "inventoryOp", inventoryOp: { op: "move", from: -1, to: 1 } }, // negative index
    { kind: "inventoryOp", inventoryOp: { op: "move", from: 0.5, to: 1 } }, // non-integer index
    { kind: "inventoryOp", inventoryOp: { op: "split", from: 0, count: 0 } }, // non-positive count
    { kind: "inventoryOp", inventoryOp: { op: "split", from: 0, count: 1000 } }, // oversized count
    { kind: "inventoryOp", inventoryOp: { op: "use", index: -1 } }, // negative index
    {
      kind: "inventoryOp",
      inventoryOp: { op: "deposit", placeableId: "", itemId: "wood", count: 1 },
    }, // empty placeableId
    {
      kind: "inventoryOp",
      inventoryOp: { op: "withdraw", placeableId: "p:1", itemId: "", count: 1 },
    }, // empty itemId
    {
      kind: "inventoryOp",
      inventoryOp: { op: "withdraw", placeableId: "p:1", itemId: "wood", count: -1 },
    }, // negative count
    { kind: "inventoryState" }, // missing capacity/slots
    { kind: "inventoryState", capacity: 1, slots: [] }, // slots length mismatch
    { kind: "inventoryState", capacity: 1, slots: [{ itemId: "wood", count: -1 }] }, // bad stack
    {
      kind: "inventoryState",
      capacity: 200,
      slots: Array.from({ length: 200 }, () => null),
    }, // oversized slot array (DoS-shaped payload)
    { kind: "chat" }, // missing channel/text
    { kind: "chat", channel: "guild", text: "hi" }, // unknown channel
    { kind: "chat", channel: "say", text: "" }, // empty text
    { kind: "chat", channel: "say", text: "a".repeat(161) }, // over the wire cap
    { kind: "chat", channel: "say", text: 7 }, // wrong type
    { kind: "chatMessage", senderPeerId: "p1", text: "hi", channel: "say", timestamp: 1 }, // missing senderName
    {
      kind: "chatMessage",
      senderPeerId: "p1",
      senderName: "Luna",
      text: "hi",
      channel: "guild",
      timestamp: 1,
    }, // unknown channel
    {
      kind: "chatMessage",
      senderPeerId: "p1",
      senderName: "Luna",
      text: "hi",
      channel: "say",
      timestamp: "now",
    }, // wrong timestamp type
    {
      kind: "chatMessage",
      senderPeerId: "p1",
      senderName: "Luna",
      text: "a".repeat(161),
      channel: "say",
      timestamp: 1,
    }, // over the wire cap
    { kind: "tradeProposeIntent" }, // missing targetPeerId
    { kind: "tradeProposeIntent", targetPeerId: "" }, // empty
    { kind: "tradeProposeIntent", targetPeerId: 7 }, // wrong type
    { kind: "tradeOfferIntent", tradeId: "t:1" }, // missing offer
    { kind: "tradeOfferIntent", tradeId: "", offer: [] }, // empty tradeId
    {
      kind: "tradeOfferIntent",
      tradeId: "t:1",
      offer: [{ itemId: "wood", count: 0 }],
    }, // non-positive count
    {
      kind: "tradeOfferIntent",
      tradeId: "t:1",
      offer: Array.from({ length: 9 }, (_, i) => ({ itemId: `item${i}`, count: 1 })),
    }, // over the 8-stack cap
    { kind: "tradeConfirmIntent" }, // missing tradeId
    { kind: "tradeConfirmIntent", tradeId: "" }, // empty
    { kind: "tradeCancelIntent" }, // missing tradeId
    { kind: "tradeCancelIntent", tradeId: 7 }, // wrong type
    { kind: "tradeState", tradeId: "t:1" }, // missing everything else
    {
      kind: "tradeState",
      tradeId: "t:1",
      peerA: "alice",
      peerB: "bob",
      offerA: [],
      offerB: [],
      confirmedA: true,
      confirmedB: false,
      status: "exploding", // unknown status
    },
    { kind: "partyAction" }, // missing action
    { kind: "partyAction", action: { op: "teleportParty" } }, // unknown op
    { kind: "partyAction", action: { op: "invite" } }, // missing targetPeerId
    { kind: "partyAction", action: { op: "invite", targetPeerId: "" } }, // empty targetPeerId
    { kind: "partyAction", action: { op: "invite", targetPeerId: "x".repeat(65) } }, // oversized targetPeerId
    { kind: "partyAction", action: { op: "setInventoryShare", shared: "yes" } }, // wrong type
    { kind: "partyVitals", health: 8 }, // missing fields
    { kind: "partyVitals", health: -1, maxHealth: 10, energy: 5, maxEnergy: 10, level: 1, damageDealt: 0, dps: 0, healing: 0, kills: 0 }, // negative
    { kind: "partyVitals", health: 8, maxHealth: 10, energy: 5, maxEnergy: 10, level: 1, damageDealt: 0, dps: 0, healing: 0, kills: Infinity }, // non-finite
    { kind: "partyVitals", health: 8, maxHealth: 10, energy: 5, maxEnergy: 10, level: 100000, damageDealt: 0, dps: 0, healing: 0, kills: 0 }, // oversized level
    { kind: "partyInventoryLookup" }, // missing targetPeerId
    { kind: "partyInventoryLookup", targetPeerId: "" }, // empty
    { kind: "party" }, // missing everything
    { kind: "party", partyId: "p1", leaderId: "alice", members: {} }, // members not an array
    {
      kind: "party",
      partyId: "p1",
      leaderId: "alice",
      members: Array.from({ length: 5 }, (_, i) => ({
        peerId: `p${i}`,
        playerName: "P",
        health: 1,
        maxHealth: 1,
        energy: 1,
        maxEnergy: 1,
        level: 1,
        damageDealt: 0,
        dps: 0,
        healing: 0,
        kills: 0,
      })),
    }, // over the 4-member cap
    { kind: "partyInvite", fromPeerId: "alice" }, // missing fromPlayerName
    { kind: "partyInventoryState", targetPeerId: "bob", capacity: 1, slots: [] }, // slots length mismatch
    // ---- E7.0 combat contracts ----
    { kind: "equipItem", slot: "shield", itemId: "iron-sword" }, // unknown slot
    { kind: "equipItem", slot: "weapon" }, // missing itemId
    { kind: "equipItem", slot: "weapon", itemId: "" }, // empty itemId
    { kind: "aimedAttack", origin: [1, 2, 3], dir: [0, 0, 1] }, // missing weaponSlot
    { kind: "aimedAttack", origin: [1, 2], dir: [0, 0, 1], weaponSlot: "weapon" }, // short origin
    { kind: "aimedAttack", origin: [1, 2, 3], dir: [0, 0, 5], weaponSlot: "weapon" }, // dir out of [-1,1]
    { kind: "aimedAttack", origin: [1, 2, 3], dir: [0.1, 0, 0], weaponSlot: "weapon" }, // dir not unit-length
    { kind: "aimedAttack", origin: [NaN, 2, 3], dir: [0, 0, 1], weaponSlot: "weapon" }, // non-finite origin
    { kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0] }, // neither dir nor groundPoint
    {
      kind: "castSpell",
      abilityId: "sparkle-bolt",
      origin: [0, 1, 0],
      dir: [1, 0, 0],
      groundPoint: [1, 0, 0],
    }, // both dir and groundPoint
    { kind: "castSpell", abilityId: "", origin: [0, 1, 0], dir: [1, 0, 0] }, // empty abilityId
    { kind: "deployItem", deployableId: "bumble-trap" }, // missing position
    { kind: "deployItem", deployableId: "bumble-trap", position: [1, "2", 3] }, // wrong type
    { kind: "projectiles" }, // missing entities
    { kind: "projectiles", entities: [{ id: "p:1", projectileId: "arrow", ownerId: "p1", x: 1, y: 2 }] }, // no z/dir
    {
      kind: "projectiles",
      entities: Array.from({ length: 260 }, (_, i) => ({
        id: `p:${i}`,
        projectileId: "arrow",
        ownerId: "p1",
        x: 0,
        y: 0,
        z: 0,
        dirX: 0,
        dirY: 0,
        dirZ: 1,
      })),
    }, // oversized array (DoS-shaped payload)
    { kind: "deployables", entities: [{ id: "d:1", deployableId: "bumble-trap", ownerId: "p1" }] }, // missing coords/armed
    { kind: "effect", effectId: "boom", x: 1, y: 2 }, // missing z
    { kind: "effect", effectId: "", x: 1, y: 2, z: 3 }, // empty effectId
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

describe("N1: playerName length bound", () => {
  const NAME_24 = "A".repeat(24);
  const NAME_25 = "A".repeat(25);

  it("accepts a join playerName at exactly the cap", () => {
    const r = parseMessage({ kind: "join", playerName: NAME_24 });
    expect(isOk(r)).toBe(true);
  });

  it("rejects a join playerName one over the cap", () => {
    const r = parseMessage({ kind: "join", playerName: NAME_25 });
    expect(isErr(r)).toBe(true);
  });

  it("accepts a peerJoined playerName at exactly the cap", () => {
    const r = parseMessage({ kind: "peerJoined", peerId: "p1", playerName: NAME_24 });
    expect(isOk(r)).toBe(true);
  });

  it("rejects a peerJoined playerName one over the cap", () => {
    const r = parseMessage({ kind: "peerJoined", peerId: "p1", playerName: NAME_25 });
    expect(isErr(r)).toBe(true);
  });
});

describe("E5.5: chat text wire bound", () => {
  const TEXT_160 = "a".repeat(160);
  const TEXT_161 = "a".repeat(161);

  it("accepts chat text at exactly the wire cap", () => {
    const r = parseMessage({ kind: "chat", channel: "say", text: TEXT_160 });
    expect(isOk(r)).toBe(true);
  });

  it("rejects chat text one over the wire cap", () => {
    const r = parseMessage({ kind: "chat", channel: "say", text: TEXT_161 });
    expect(isErr(r)).toBe(true);
  });
});

describe("N1: unknown-kind log slice", () => {
  it("caps the reason string for an oversized attacker-controlled kind", () => {
    const hostileKind = "x".repeat(5000);
    const r = parseMessage({ kind: hostileKind });
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.reason.length).toBeLessThan(100);
      expect(r.error.reason).toBe(`unknown kind: ${"x".repeat(40)}`);
    }
  });
});
