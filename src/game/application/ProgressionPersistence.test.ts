import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { ACHIEVEMENTS } from "../domain/progression/Achievements";
import { markKeyhintShown, emptyKeyhintState } from "../domain/progression/Keyhints";
import { TUTORIAL_OBJECTIVES } from "../domain/progression/Objectives";
import { emptyProgression, recordProgressionEvent } from "../domain/progression/ProgressionState";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { ProgressionPersistence } from "./ProgressionPersistence";

/** Honest fake — mirrors InventoryPersistence.test.ts's fake exactly
 *  (test-honest-fakes-over-mocks); dependency-cruiser forbids importing the
 *  real infrastructure adapter from application-layer code. */
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

function seeded() {
  let progression = emptyProgression();
  progression = recordProgressionEvent(progression, "harvest", TUTORIAL_OBJECTIVES, ACHIEVEMENTS).state;
  progression = recordProgressionEvent(progression, "craft", TUTORIAL_OBJECTIVES, ACHIEVEMENTS).state;
  const keyhints = markKeyhintShown(emptyKeyhintState(), "eat");
  return { progression, keyhints };
}

describe("ProgressionPersistence", () => {
  it("round-trips progression + keyhint state through the save store", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new ProgressionPersistence(store);
    const { progression, keyhints } = seeded();

    const saved = await persistence.save("w1", "player", progression, keyhints);
    expect(isOk(saved)).toBe(true);

    const loaded = await persistence.load("w1", "player");
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.value.progression.counts.harvest).toBe(1);
      expect(loaded.value.progression.counts.craft).toBe(1);
      expect(loaded.value.progression.completedObjectives).toEqual(
        expect.arrayContaining(["tut-harvest", "tut-craft"]),
      );
      expect(loaded.value.progression.unlockedAchievements).toEqual(
        expect.arrayContaining(["first-harvest", "first-craft", "tier-1-reached"]),
      );
      expect(loaded.value.keyhints.shown).toEqual(["eat"]);
    }
  });

  it("keeps distinct owners' progression separate", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new ProgressionPersistence(store);
    const { progression, keyhints } = seeded();

    await persistence.save("w1", "player", progression, keyhints);
    await persistence.save("w1", "player-2", emptyProgression(), emptyKeyhintState());

    const p1 = await persistence.load("w1", "player");
    const p2 = await persistence.load("w1", "player-2");
    if (isOk(p1)) expect(p1.value.progression.counts.harvest).toBe(1);
    if (isOk(p2)) expect(p2.value.progression.counts.harvest).toBe(0);
  });

  it("does not disturb other save fields when writing progression", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ seed: 777, inventories: { player: { capacity: 1, slots: [] } } }));
    const persistence = new ProgressionPersistence(store);

    await persistence.save("w1", "player", emptyProgression(), emptyKeyhintState());

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.seed).toBe(777);
      expect(reloaded.value.inventories).toEqual({ player: { capacity: 1, slots: [] } });
    }
  });

  it("reports NoProgression for an owner that was never saved", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new ProgressionPersistence(store);

    const loaded = await persistence.load("w1", "ghost");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoProgression");
  });

  it("propagates NotFound when the world does not exist", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new ProgressionPersistence(store);

    const saved = await persistence.save("missing", "player", emptyProgression(), emptyKeyhintState());
    expect(isErr(saved)).toBe(true);
    if (isErr(saved)) expect(saved.error.kind).toBe("NotFound");
  });

  it("reports CorruptProgression for a malformed stored blob", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ progression: { player: { counts: "nope" } } }));
    const persistence = new ProgressionPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptProgression");
  });
});
