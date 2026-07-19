import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { createWorldClock } from "../domain/time/WorldClock";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { WORLD_CLOCK_ENTITY_KEY, WorldClockPersistence, readWorldClockHour } from "./WorldClockPersistence";

/** Honest fake — mirrors ProgressionPersistence.test.ts's fake exactly
 *  (test-honest-fakes-over-mocks). */
class FakeWorldSaveStore implements WorldSaveStore {
  private readonly worlds = new Map<WorldId, WorldSaveData>();

  save(save: WorldSaveData): Promise<Result<void, SaveError>> {
    this.worlds.set(save.worldId, structuredClone(save));
    return Promise.resolve(ok(undefined));
  }

  load(worldId: WorldId): Promise<Result<WorldSaveData, SaveError>> {
    const found = this.worlds.get(worldId);
    if (!found) return Promise.resolve(err({ kind: "NotFound", worldId }));
    return Promise.resolve(ok(structuredClone(found)));
  }

  list(): Promise<Result<readonly WorldSummary[], SaveError>> {
    return Promise.resolve(ok([...this.worlds.values()].map(summarize)));
  }

  delete(worldId: WorldId): Promise<Result<void, SaveError>> {
    if (!this.worlds.delete(worldId)) return Promise.resolve(err({ kind: "NotFound", worldId }));
    return Promise.resolve(ok(undefined));
  }
}

function aWorld(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
  return {
    worldId: "w1",
    seed: 42,
    name: "Test World",
    createdAt: 1000,
    modifiedAt: 1000,
    modifiedChunks: [],
    entities: {},
    inventories: {},
    progression: {},
    playerState: { position: [0, 64, 0], yaw: 0, pitch: 0 },
    ...overrides,
  };
}

describe("WorldClockPersistence", () => {
  it("round-trips the current hour through the save store's entities bag", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new WorldClockPersistence(store);

    const saved = await persistence.save("w1", createWorldClock(17.5));
    expect(isOk(saved)).toBe(true);

    const loaded = await persistence.load("w1");
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) expect(loaded.value.hour).toBeCloseTo(17.5);

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect((reloaded.value.entities[WORLD_CLOCK_ENTITY_KEY] as { hour: number }).hour).toBeCloseTo(17.5);
    }
  });

  it("does not disturb other save fields when writing the clock", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ seed: 777, inventories: { player: { capacity: 1, slots: [] } } }));
    const persistence = new WorldClockPersistence(store);

    await persistence.save("w1", createWorldClock(3));

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.seed).toBe(777);
      expect(reloaded.value.inventories).toEqual({ player: { capacity: 1, slots: [] } });
    }
  });

  it("reports NoWorldClock for a save that never persisted one", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new WorldClockPersistence(store);

    const loaded = await persistence.load("w1");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoWorldClock");
  });

  it("propagates NotFound when the world does not exist", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new WorldClockPersistence(store);

    const saved = await persistence.save("missing", createWorldClock(0));
    expect(isErr(saved)).toBe(true);
    if (isErr(saved)) expect(saved.error.kind).toBe("NotFound");
  });

  it("reports CorruptWorldClock for a malformed stored blob", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ entities: { [WORLD_CLOCK_ENTITY_KEY]: { hour: Number.NaN } } }));
    const persistence = new WorldClockPersistence(store);

    const loaded = await persistence.load("w1");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptWorldClock");
  });

  it("does not disturb other entities when writing the clock", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ entities: { "voxel.digSpheres": [1, 2, 3] } }));
    const persistence = new WorldClockPersistence(store);

    await persistence.save("w1", createWorldClock(5));

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.entities["voxel.digSpheres"]).toEqual([1, 2, 3]);
    }
  });
});

describe("readWorldClockHour", () => {
  it("returns null when the entities bag has no clock entry", () => {
    expect(readWorldClockHour({})).toBeNull();
  });

  it("returns the hour when present and valid", () => {
    expect(readWorldClockHour({ [WORLD_CLOCK_ENTITY_KEY]: { hour: 8.5 } })).toBeCloseTo(8.5);
  });

  it("returns null for a malformed entry instead of throwing", () => {
    expect(readWorldClockHour({ [WORLD_CLOCK_ENTITY_KEY]: { hour: "nope" } })).toBeNull();
  });
});
