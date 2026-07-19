import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { allocateStatPoint, grantCharacterXp, newCharacter } from "../domain/character/Character";
import { xpForLevel } from "../domain/character/Leveling";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { CharacterPersistence } from "./CharacterPersistence";

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

/** A save literal WITHOUT `character` at all — the pre-Phase-E1 shape every
 *  existing save on disk has. Proves old saves keep loading unchanged. */
function preE1World(overrides: Partial<WorldSaveData> = {}): WorldSaveData {
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

function leveled() {
  let character = newCharacter();
  character = grantCharacterXp(character, xpForLevel(1)).character; // level 2, 1 stat + 1 talent point
  const spent = allocateStatPoint(character, "vigor");
  if (!isOk(spent)) throw new Error("setup");
  return spent.value;
}

describe("CharacterPersistence", () => {
  it("round-trips level/xp/attributes/talent points through the save store", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE1World());
    const persistence = new CharacterPersistence(store);
    const character = leveled();

    const saved = await persistence.save("w1", "player", character);
    expect(isOk(saved)).toBe(true);

    const loaded = await persistence.load("w1", "player");
    expect(isOk(loaded)).toBe(true);
    if (!isOk(loaded)) return;
    expect(loaded.value.level.level).toBe(2);
    expect(loaded.value.stats.attributes.vigor).toBe(1);
    expect(loaded.value.stats.unspentPoints).toBe(0);
    expect(loaded.value.talents.unspentPoints).toBe(1);
  });

  it("keeps distinct owners' characters separate", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE1World());
    const persistence = new CharacterPersistence(store);

    await persistence.save("w1", "player", leveled());
    await persistence.save("w1", "player-2", newCharacter());

    const p1 = await persistence.load("w1", "player");
    const p2 = await persistence.load("w1", "player-2");
    if (isOk(p1)) expect(p1.value.level.level).toBe(2);
    if (isOk(p2)) expect(p2.value.level.level).toBe(1);
  });

  it("does not disturb other save fields when writing a character", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE1World({ seed: 777, inventories: { player: { capacity: 1, slots: [] } } }));
    const persistence = new CharacterPersistence(store);

    await persistence.save("w1", "player", newCharacter());

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.seed).toBe(777);
      expect(reloaded.value.inventories).toEqual({ player: { capacity: 1, slots: [] } });
    }
  });

  it("reports NoCharacter (not corrupt) when the save has no `character` field at all — old saves load unchanged", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE1World());
    const persistence = new CharacterPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoCharacter");
  });

  it("reports NoCharacter for an owner that was never saved", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE1World({ character: {} }));
    const persistence = new CharacterPersistence(store);

    const loaded = await persistence.load("w1", "ghost");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoCharacter");
  });

  it("propagates NotFound when the world does not exist", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new CharacterPersistence(store);

    const saved = await persistence.save("missing", "player", newCharacter());
    expect(isErr(saved)).toBe(true);
    if (isErr(saved)) expect(saved.error.kind).toBe("NotFound");
  });

  it("reports CorruptCharacter for a malformed stored blob", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(preE1World({ character: { player: { level: "nope" } } }));
    const persistence = new CharacterPersistence(store);

    const loaded = await persistence.load("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptCharacter");
  });
});
