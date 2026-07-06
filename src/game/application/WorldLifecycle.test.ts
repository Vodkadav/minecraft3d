import { describe, expect, it } from "vitest";
import { isErr, isOk } from "../domain/Result";
import { createNewWorldSave } from "../domain/world/NewWorldSave";
import type { PlayerState } from "../domain/world/WorldSaveData";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { WorldLifecycle } from "./WorldLifecycle";

function storeWith(worldId: string, seed: number, now = 1000) {
  const store = new InMemoryWorldSaveStore();
  const save = createNewWorldSave({ worldId, seed, name: "My World", now });
  return { store, save };
}

const POSE: PlayerState = { position: [12, 34, 56], yaw: 1.2, pitch: -0.3 };

describe("WorldLifecycle.launch", () => {
  it("resolves a saved world into the engine boot descriptor", async () => {
    const { store, save } = storeWith("w1", 777);
    await store.save(save);
    const life = new WorldLifecycle(store);

    const r = await life.launch("w1");
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.worldId).toBe("w1");
      expect(r.value.seed).toBe(777);
      expect(r.value.name).toBe("My World");
      expect(r.value.playerState).toEqual(save.playerState);
      expect(r.value.save).toEqual(save);
    }
  });

  it("returns NotFound for an unknown world", async () => {
    const life = new WorldLifecycle(new InMemoryWorldSaveStore());
    const r = await life.launch("missing");
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NotFound");
  });
});

describe("WorldLifecycle.savePlayerState", () => {
  it("writes the pose back and bumps modifiedAt, preserving the rest", async () => {
    const { store, save } = storeWith("w1", 777, 1000);
    await store.save(save);
    const life = new WorldLifecycle(store, { clock: () => 5000 });

    const w = await life.savePlayerState("w1", POSE);
    expect(isOk(w)).toBe(true);

    const reloaded = await store.load("w1");
    if (!isOk(reloaded)) throw new Error("reload failed");
    expect(reloaded.value.playerState).toEqual(POSE);
    expect(reloaded.value.modifiedAt).toBe(5000);
    expect(reloaded.value.seed).toBe(777);
    expect(reloaded.value.createdAt).toBe(save.createdAt);
    expect(reloaded.value.modifiedChunks).toEqual(save.modifiedChunks);
  });

  it("returns NotFound when saving a pose for an unknown world", async () => {
    const life = new WorldLifecycle(new InMemoryWorldSaveStore());
    const r = await life.savePlayerState("missing", POSE);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.kind).toBe("NotFound");
  });

  it("round-trips: a saved pose is restored by the next launch", async () => {
    const { store, save } = storeWith("w1", 42);
    await store.save(save);
    const life = new WorldLifecycle(store);

    await life.savePlayerState("w1", POSE);
    const r = await life.launch("w1");
    if (!isOk(r)) throw new Error("launch failed");
    expect(r.value.playerState).toEqual(POSE);
  });
});
