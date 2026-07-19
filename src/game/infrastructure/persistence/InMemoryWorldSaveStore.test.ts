import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../../domain/Result";
import type { WorldSaveData } from "../../domain/world/WorldSaveData";
import { InMemoryWorldSaveStore } from "./InMemoryWorldSaveStore";

function aWorld(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
  return {
    worldId: "w1",
    seed: 1234,
    name: "Test World",
    createdAt: 1000,
    modifiedAt: 1000,
    modifiedChunks: [{ key: "0,0,0", rev: 1, data: new Uint8Array([1, 2, 3]) }],
    entities: {},
    inventories: {},
    progression: {},
    playerState: { position: [0, 64, 0], yaw: 0, pitch: 0 },
    ...overrides,
  };
}

describe("InMemoryWorldSaveStore (WorldSaveStore contract)", () => {
  it("round-trips a saved world by id", async () => {
    const store = new InMemoryWorldSaveStore();
    await store.save(aWorld());

    const loaded = await store.load("w1");

    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.value.seed).toBe(1234);
      expect([...loaded.value.modifiedChunks[0].data]).toEqual([1, 2, 3]);
    }
  });

  it("returns NotFound for an unknown world", async () => {
    const store = new InMemoryWorldSaveStore();

    const loaded = await store.load("missing");

    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NotFound");
  });

  it("isolates stored state from later caller mutation", async () => {
    const store = new InMemoryWorldSaveStore();
    const input = aWorld();
    await store.save(input);

    input.modifiedChunks[0].data[0] = 99;

    const loaded = await store.load("w1");
    if (isOk(loaded)) expect(loaded.value.modifiedChunks[0].data[0]).toBe(1);
  });

  it("lists summaries newest-modified first, without chunk blobs", async () => {
    const store = new InMemoryWorldSaveStore();
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
    const store = new InMemoryWorldSaveStore();
    await store.save(aWorld());

    expect(isOk(await store.delete("w1"))).toBe(true);
    expect(isErr(await store.delete("w1"))).toBe(true);
  });
});
