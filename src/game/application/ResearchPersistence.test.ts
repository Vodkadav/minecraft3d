import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { emptyResearchState, unlockResearchNode, type ResearchState } from "../domain/research/ResearchTree";
import { RESEARCH_NODES } from "../domain/research/starterResearchTree";
import { emptyProgression } from "../domain/progression/ProgressionState";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { ResearchPersistence } from "./ResearchPersistence";

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

/** A save literal WITHOUT `research` at all — the pre-Phase-E6.4 shape every
 *  existing save on disk has. Proves old saves keep loading unchanged. */
function preE64World(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
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

function withUnlockedNode(): ResearchState {
  const progression = { ...emptyProgression(), counts: { ...emptyProgression().counts, dig: 5 } };
  const r = unlockResearchNode(RESEARCH_NODES, emptyResearchState(), progression, "sharpTools");
  if (!isOk(r)) throw new Error("setup");
  return r.value;
}

describe("ResearchPersistence", () => {
  it("round-trips unlocked nodes and spent points through the save store", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE64World());
    const persistence = new ResearchPersistence(store);
    const research = withUnlockedNode();

    const saved = await persistence.save("w1", "player", research);
    expect(isOk(saved)).toBe(true);

    const loaded = await persistence.load("w1", "player");
    expect(isOk(loaded)).toBe(true);
    if (!isOk(loaded)) return;
    expect(loaded.value.unlockedNodeIds).toEqual(["sharpTools"]);
    expect(loaded.value.spentPoints).toBe(1);
  });

  it("keeps distinct owners' research separate", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE64World());
    const persistence = new ResearchPersistence(store);

    await persistence.save("w1", "player", withUnlockedNode());
    await persistence.save("w1", "player-2", emptyResearchState());

    const p1 = await persistence.load("w1", "player");
    const p2 = await persistence.load("w1", "player-2");
    if (isOk(p1)) expect(p1.value.unlockedNodeIds).toEqual(["sharpTools"]);
    if (isOk(p2)) expect(p2.value.unlockedNodeIds).toEqual([]);
  });

  it("does not disturb other save fields when writing research", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE64World({ seed: 777, inventories: { player: { capacity: 1, slots: [] } } }));
    const persistence = new ResearchPersistence(store);

    await persistence.save("w1", "player", emptyResearchState());

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.seed).toBe(777);
      expect(reloaded.value.inventories).toEqual({ player: { capacity: 1, slots: [] } });
    }
  });

  it("reports NoResearch (not corrupt) when the save has no `research` field at all — old saves load unchanged", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE64World());
    const persistence = new ResearchPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoResearch");
  });

  it("reports NoResearch for an owner that was never saved", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE64World({ research: {} }));
    const persistence = new ResearchPersistence(store);

    const loaded = await persistence.load("w1", "ghost");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoResearch");
  });

  it("propagates NotFound when the world does not exist", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new ResearchPersistence(store);

    const saved = await persistence.save("missing", "player", emptyResearchState());
    expect(isErr(saved)).toBe(true);
    if (isErr(saved)) expect(saved.error.kind).toBe("NotFound");
  });

  it("reports CorruptResearch for a malformed stored blob", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE64World({ research: { player: { unlockedNodeIds: "nope" } } }));
    const persistence = new ResearchPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptResearch");
  });
});
