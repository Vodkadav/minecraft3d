import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../../domain/Result";
import type { WorldSaveData } from "../../domain/world/WorldSaveData";
import { InMemoryBlobStore } from "./InMemoryBlobStore";
import { InMemoryKeyValueStore } from "./InMemoryKeyValueStore";
import { PersistentWorldSaveStore } from "./PersistentWorldSaveStore";

function aWorld(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
  return {
    worldId: "w1",
    seed: 1234,
    name: "Test World",
    createdAt: 1000,
    modifiedAt: 1000,
    modifiedChunks: [
      { key: "0,0,0", rev: 1, data: new Uint8Array([1, 2, 3]) },
      { key: "1,0,0", rev: 1, data: new Uint8Array([9]) },
    ],
    entities: { e1: { hp: 5 } },
    inventories: {},
    playerState: { position: [0, 64, 0], yaw: 0, pitch: 0 },
    ...overrides,
  };
}

function newStore(): {
  store: PersistentWorldSaveStore;
  blobs: InMemoryBlobStore;
  meta: InMemoryKeyValueStore;
} {
  const blobs = new InMemoryBlobStore();
  const meta = new InMemoryKeyValueStore();
  return { store: new PersistentWorldSaveStore(blobs, meta), blobs, meta };
}

describe("PersistentWorldSaveStore (WorldSaveStore contract)", () => {
  it("round-trips a saved world by id with byte fidelity", async () => {
    const { store } = newStore();
    await store.save(aWorld());

    const loaded = await store.load("w1");

    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.value).toEqual(aWorld());
      expect([...loaded.value.modifiedChunks[0].data]).toEqual([1, 2, 3]);
    }
  });

  it("returns NotFound for an unknown world", async () => {
    const { store } = newStore();

    const loaded = await store.load("missing");

    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NotFound");
  });

  it("lists summaries newest-modified first, without chunk blobs", async () => {
    const { store } = newStore();
    await store.save(aWorld({ worldId: "old", modifiedAt: 1 }));
    await store.save(aWorld({ worldId: "new", modifiedAt: 500 }));

    const listed = await store.list();

    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.value.map((s) => s.worldId)).toEqual(["new", "old"]);
      expect(listed.value[0]).not.toHaveProperty("modifiedChunks");
    }
  });

  it("deletes a world and reports NotFound on a second delete", async () => {
    const { store } = newStore();
    await store.save(aWorld());

    expect(isOk(await store.delete("w1"))).toBe(true);
    expect(isErr(await store.delete("w1"))).toBe(true);
  });

  it("removes the deleted world's chunk blobs", async () => {
    const { store, blobs } = newStore();
    await store.save(aWorld());

    await store.delete("w1");

    const remaining = await blobs.keys("w1/");
    if (isOk(remaining)) expect(remaining.value).toEqual([]);
  });

  it("prunes stale chunk blobs when overwriting with fewer chunks", async () => {
    const { store, blobs } = newStore();
    await store.save(aWorld());

    await store.save(
      aWorld({
        modifiedChunks: [{ key: "0,0,0", rev: 2, data: new Uint8Array([7]) }],
      }),
    );

    const keys = await blobs.keys("w1/");
    if (isOk(keys)) expect([...keys.value].sort()).toEqual(["w1/0,0,0"]);
    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.modifiedChunks.map((c) => c.key)).toEqual(["0,0,0"]);
    }
  });

  it("reports Corrupt when the stored metadata is not valid JSON", async () => {
    const { store, meta } = newStore();
    await meta.put("world:w1", "{not json");

    const loaded = await store.load("w1");

    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("Corrupt");
  });

  it("reports Corrupt when an indexed chunk blob is missing", async () => {
    const { store, blobs } = newStore();
    await store.save(aWorld());
    await blobs.delete("w1/1,0,0");

    const loaded = await store.load("w1");

    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("Corrupt");
  });

  it("round-trips a world with no modified chunks", async () => {
    const { store } = newStore();
    await store.save(aWorld({ worldId: "empty", modifiedChunks: [] }));

    const loaded = await store.load("empty");

    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) expect(loaded.value.modifiedChunks).toEqual([]);
  });
});
