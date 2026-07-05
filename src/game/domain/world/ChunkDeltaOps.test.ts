import { describe, expect, it } from "vitest";
import type { ChunkDelta } from "./WorldSaveData";
import {
  mergeChunkDeltas,
  modifiedChunkKeys,
  removeChunkDelta,
  upsertChunkDelta,
} from "./ChunkDeltaOps";

function delta(key: string, rev: number, bytes: number[] = [rev]): ChunkDelta {
  return { key, rev, data: new Uint8Array(bytes) };
}

describe("upsertChunkDelta", () => {
  it("appends a new-key delta preserving existing order", () => {
    const base = [delta("0,0,0", 1), delta("1,0,0", 1)];

    const next = upsertChunkDelta(base, delta("2,0,0", 1));

    expect(next.map((d) => d.key)).toEqual(["0,0,0", "1,0,0", "2,0,0"]);
  });

  it("replaces in place when the incoming rev is higher", () => {
    const base = [delta("0,0,0", 1, [1]), delta("1,0,0", 1)];

    const next = upsertChunkDelta(base, delta("0,0,0", 2, [9]));

    expect(next.map((d) => d.key)).toEqual(["0,0,0", "1,0,0"]);
    expect(next[0].rev).toBe(2);
    expect([...next[0].data]).toEqual([9]);
  });

  it("replaces on an equal rev (incoming wins ties)", () => {
    const base = [delta("0,0,0", 3, [1])];

    const next = upsertChunkDelta(base, delta("0,0,0", 3, [7]));

    expect([...next[0].data]).toEqual([7]);
  });

  it("keeps the existing delta when the incoming rev is lower (stale edit)", () => {
    const base = [delta("0,0,0", 5, [5])];

    const next = upsertChunkDelta(base, delta("0,0,0", 2, [2]));

    expect(next[0].rev).toBe(5);
    expect([...next[0].data]).toEqual([5]);
  });

  it("does not mutate the input array", () => {
    const base = [delta("0,0,0", 1)];

    upsertChunkDelta(base, delta("1,0,0", 1));

    expect(base).toHaveLength(1);
  });
});

describe("removeChunkDelta", () => {
  it("drops the delta with the given key", () => {
    const base = [delta("0,0,0", 1), delta("1,0,0", 1)];

    const next = removeChunkDelta(base, "0,0,0");

    expect(next.map((d) => d.key)).toEqual(["1,0,0"]);
  });

  it("returns an equivalent list when the key is absent", () => {
    const base = [delta("0,0,0", 1)];

    const next = removeChunkDelta(base, "9,9,9");

    expect(next.map((d) => d.key)).toEqual(["0,0,0"]);
  });
});

describe("modifiedChunkKeys", () => {
  it("returns the distinct set of keys", () => {
    const base = [delta("0,0,0", 1), delta("1,0,0", 1)];

    const keys = modifiedChunkKeys(base);

    expect(keys).toEqual(new Set(["0,0,0", "1,0,0"]));
  });

  it("is empty for no deltas", () => {
    expect(modifiedChunkKeys([])).toEqual(new Set());
  });
});

describe("mergeChunkDeltas", () => {
  it("keeps the highest rev per key and appends new keys", () => {
    const base = [delta("0,0,0", 1, [1]), delta("1,0,0", 3, [3])];
    const incoming = [delta("0,0,0", 4, [4]), delta("2,0,0", 1, [2])];

    const merged = mergeChunkDeltas(base, incoming);

    expect(merged.map((d) => d.key)).toEqual(["0,0,0", "1,0,0", "2,0,0"]);
    expect(merged.find((d) => d.key === "0,0,0")?.rev).toBe(4);
    expect(merged.find((d) => d.key === "1,0,0")?.rev).toBe(3);
  });
});
