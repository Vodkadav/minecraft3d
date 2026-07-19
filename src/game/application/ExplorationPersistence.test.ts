import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { emptyExploration, revealAround } from "../domain/map/Exploration";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { ExplorationPersistence, loadExplorationOrEmpty } from "./ExplorationPersistence";

/** Honest fake — mirrors CharacterPersistence.test.ts's fake exactly
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

/** A save literal WITHOUT `exploration` at all — the pre-Phase-E3 shape
 *  every existing save on disk has. Proves old saves keep loading unchanged. */
function preE3World(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
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

describe("ExplorationPersistence", () => {
  it("round-trips discovered cells through the save store", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World());
    const persistence = new ExplorationPersistence(store);
    const explored = revealAround(emptyExploration(12), 0, 0, 1);

    const saved = await persistence.save("w1", "player", explored);
    expect(isOk(saved)).toBe(true);

    const loaded = await persistence.load("w1", "player");
    expect(isOk(loaded)).toBe(true);
    if (!isOk(loaded)) return;
    expect(loaded.value.cellMeters).toBe(12);
    expect(loaded.value.discovered).toEqual(explored.discovered);
  });

  it("keeps distinct owners' exploration separate", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World());
    const persistence = new ExplorationPersistence(store);

    await persistence.save("w1", "player", revealAround(emptyExploration(), 0, 0, 0));
    await persistence.save("w1", "player-2", revealAround(emptyExploration(), 500, 500, 0));

    const p1 = await persistence.load("w1", "player");
    const p2 = await persistence.load("w1", "player-2");
    if (isOk(p1)) expect(p1.value.discovered.has("0,0")).toBe(true);
    if (isOk(p2)) expect(p2.value.discovered.has("0,0")).toBe(false);
  });

  it("does not disturb other save fields when writing exploration", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World({ seed: 777, inventories: { player: { capacity: 1, slots: [] } } }));
    const persistence = new ExplorationPersistence(store);

    await persistence.save("w1", "player", emptyExploration());

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.seed).toBe(777);
      expect(reloaded.value.inventories).toEqual({ player: { capacity: 1, slots: [] } });
    }
  });

  it("reports NoExploration (not corrupt) when the save has no `exploration` field at all — old saves load unchanged", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World());
    const persistence = new ExplorationPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoExploration");
  });

  it("reports NoExploration for an owner that was never saved", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World({ exploration: {} }));
    const persistence = new ExplorationPersistence(store);

    const loaded = await persistence.load("w1", "ghost");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoExploration");
  });

  it("propagates NotFound when the world does not exist", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new ExplorationPersistence(store);

    const saved = await persistence.save("missing", "player", emptyExploration());
    expect(isErr(saved)).toBe(true);
    if (isErr(saved)) expect(saved.error.kind).toBe("NotFound");
  });

  it("reports CorruptExploration for a malformed stored blob", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World({ exploration: { player: { cellMeters: "nope" } } }));
    const persistence = new ExplorationPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptExploration");
  });

  it("reports CorruptExploration for a bad cell-key entry", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World({ exploration: { player: { cellMeters: 12, discovered: ["not-a-cell"] } } }));
    const persistence = new ExplorationPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptExploration");
  });

  it("loadExplorationOrEmpty falls back to empty on NoExploration", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE3World());
    const persistence = new ExplorationPersistence(store);

    const state = await loadExplorationOrEmpty(persistence, "w1", "player");
    expect(state.discovered.size).toBe(0);
  });
});
