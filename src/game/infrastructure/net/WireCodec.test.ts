import { describe, expect, it } from "vitest";
import { decodeWire, encodeWire } from "./WireCodec";

describe("WireCodec", () => {
  it("round-trips a welcome-shaped message with nested Uint8Array deltas", () => {
    const msg = {
      kind: "welcome",
      seed: 42,
      worldId: "w1",
      name: "Home",
      modifiedChunks: [
        { key: "0,0,0", rev: 2, data: new Uint8Array([7, 0, 255]) },
        { key: "1,0,0", rev: 1, data: new Uint8Array() },
      ],
      entities: { "quest.flags": ["intro"] },
    };
    const decoded = decodeWire(JSON.parse(JSON.stringify(encodeWire(msg)))) as typeof msg;
    expect(decoded.modifiedChunks[0].data).toBeInstanceOf(Uint8Array);
    expect([...decoded.modifiedChunks[0].data]).toEqual([7, 0, 255]);
    expect([...decoded.modifiedChunks[1].data]).toEqual([]);
    expect(decoded).toEqual(msg);
  });

  it("passes plain messages through unchanged", () => {
    const msg = { kind: "pose", state: { position: [1, 2, 3], yaw: 0.5, pitch: 0 } };
    expect(encodeWire(msg)).toEqual(msg);
    expect(decodeWire(msg)).toEqual(msg);
  });

  it("leaves primitives and null alone", () => {
    expect(encodeWire(null)).toBeNull();
    expect(decodeWire(42)).toBe(42);
    expect(decodeWire("x")).toBe("x");
  });
});

describe("WireCodec — E7.0 combat contract shapes round-trip", () => {
  function roundTrip<T>(msg: T): T {
    return decodeWire(JSON.parse(JSON.stringify(encodeWire(msg)))) as T;
  }

  it("round-trips equipItem", () => {
    const msg = { kind: "equipItem", slot: "weapon", itemId: "iron-sword" };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips aimedAttack", () => {
    const msg = { kind: "aimedAttack", origin: [1, 2, 3], dir: [0, 0, 1], weaponSlot: "weapon" };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips castSpell with a dir", () => {
    const msg = { kind: "castSpell", abilityId: "sparkle-bolt", origin: [0, 1, 0], dir: [1, 0, 0] };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips castSpell with a groundPoint", () => {
    const msg = {
      kind: "castSpell",
      abilityId: "vine-snare",
      origin: [0, 1, 0],
      groundPoint: [5, 0, 5],
    };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips deployItem", () => {
    const msg = { kind: "deployItem", deployableId: "bumble-trap", position: [3, 0, 3] };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips projectiles", () => {
    const msg = {
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
    };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips deployables", () => {
    const msg = {
      kind: "deployables",
      entities: [
        { id: "dep:1", deployableId: "bumble-trap", ownerId: "p1", x: 1, y: 0, z: 2, armed: true },
      ],
    };
    expect(roundTrip(msg)).toEqual(msg);
  });

  it("round-trips effect", () => {
    const msg = { kind: "effect", effectId: "boom", x: 1, y: 2, z: 3 };
    expect(roundTrip(msg)).toEqual(msg);
  });
});
