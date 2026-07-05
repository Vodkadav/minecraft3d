import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../Result";
import type { WorldSaveData } from "./WorldSaveData";
import {
  decodeWorldSave,
  encodeWorldSave,
  type EncodedWorldSave,
} from "./WorldSaveSerialization";

function aWorld(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
  return {
    worldId: "w1",
    seed: 1234,
    name: "Test World",
    createdAt: 1000,
    modifiedAt: 2000,
    modifiedChunks: [
      { key: "0,0,0", rev: 1, data: new Uint8Array([1, 2, 3]) },
      { key: "1,-2,3", rev: 4, data: new Uint8Array([255, 0, 128]) },
    ],
    entities: { e1: { hp: 5 } },
    inventories: { p1: { slots: [] } },
    playerState: { position: [1, 64, -3], yaw: 0.5, pitch: -0.2 },
    ...overrides,
  };
}

describe("encodeWorldSave / decodeWorldSave", () => {
  it("round-trips a full world with byte fidelity", () => {
    const encoded = encodeWorldSave(aWorld());

    const decoded = decodeWorldSave(encoded);

    expect(isOk(decoded)).toBe(true);
    if (isOk(decoded)) {
      expect(decoded.value).toEqual(aWorld());
      expect([...decoded.value.modifiedChunks[1].data]).toEqual([255, 0, 128]);
    }
  });

  it("separates metadata (no bytes) from binary blobs", () => {
    const encoded = encodeWorldSave(aWorld());

    expect(encoded.blobs.map((b) => b.key)).toEqual(["0,0,0", "1,-2,3"]);
    expect(encoded.metadata.chunkIndex).toEqual([
      { key: "0,0,0", rev: 1 },
      { key: "1,-2,3", rev: 4 },
    ]);
    expect(JSON.stringify(encoded.metadata)).not.toContain("data");
  });

  it("produces JSON-safe metadata that survives a JSON round-trip", () => {
    const encoded = encodeWorldSave(aWorld());

    const reparsed = JSON.parse(JSON.stringify(encoded.metadata));

    expect(reparsed).toEqual(encoded.metadata);
  });

  it("round-trips a world with no modified chunks", () => {
    const encoded = encodeWorldSave(aWorld({ modifiedChunks: [] }));
    expect(encoded.blobs).toEqual([]);

    const decoded = decodeWorldSave(encoded);
    expect(isOk(decoded)).toBe(true);
    if (isOk(decoded)) expect(decoded.value.modifiedChunks).toEqual([]);
  });

  it("round-trips an empty chunk blob (zero-length edit)", () => {
    const world = aWorld({
      modifiedChunks: [{ key: "0,0,0", rev: 1, data: new Uint8Array([]) }],
    });

    const decoded = decodeWorldSave(encodeWorldSave(world));

    expect(isOk(decoded)).toBe(true);
    if (isOk(decoded)) {
      expect(decoded.value.modifiedChunks[0].data).toEqual(new Uint8Array([]));
    }
  });

  it("fails to decode when an indexed blob is missing", () => {
    const encoded: EncodedWorldSave = {
      metadata: {
        ...encodeWorldSave(aWorld()).metadata,
      },
      blobs: [{ key: "0,0,0", bytes: new Uint8Array([1]) }],
    };

    const decoded = decodeWorldSave(encoded);

    expect(isErr(decoded)).toBe(true);
    if (isErr(decoded)) {
      expect(decoded.error.kind).toBe("MissingBlob");
      if (decoded.error.kind === "MissingBlob") {
        expect(decoded.error.key).toBe("1,-2,3");
      }
    }
  });

  it("fails to decode when a blob has no index entry (orphan)", () => {
    const good = encodeWorldSave(aWorld({ modifiedChunks: [] }));
    const encoded: EncodedWorldSave = {
      metadata: good.metadata,
      blobs: [{ key: "9,9,9", bytes: new Uint8Array([1]) }],
    };

    const decoded = decodeWorldSave(encoded);

    expect(isErr(decoded)).toBe(true);
    if (isErr(decoded)) expect(decoded.error.kind).toBe("OrphanBlob");
  });

  it("reconstructs chunk deltas in the metadata index order", () => {
    const encoded = encodeWorldSave(aWorld());
    const shuffled: EncodedWorldSave = {
      metadata: encoded.metadata,
      blobs: [encoded.blobs[1], encoded.blobs[0]],
    };

    const decoded = decodeWorldSave(shuffled);

    expect(isOk(decoded)).toBe(true);
    if (isOk(decoded)) {
      expect(decoded.value.modifiedChunks.map((c) => c.key)).toEqual([
        "0,0,0",
        "1,-2,3",
      ]);
    }
  });
});
