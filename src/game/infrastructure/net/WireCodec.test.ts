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
