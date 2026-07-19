import { describe, expect, it } from "vitest";
import { isOk, ok, type Result } from "../domain/Result";
import { Inventory } from "../domain/inventory/Inventory";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../domain/items/starterItems";
import { emptyKeyhintState, markKeyhintShown } from "../domain/progression/Keyhints";
import { emptyProgression, recordProgressionEvent } from "../domain/progression/ProgressionState";
import { TUTORIAL_OBJECTIVES } from "../domain/progression/Objectives";
import { ACHIEVEMENTS } from "../domain/progression/Achievements";
import { allocateStatPoint, grantCharacterXp, newCharacter } from "../domain/character/Character";
import { xpForLevel } from "../domain/character/Leveling";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { CharacterPersistence } from "./CharacterPersistence";
import { GameStatePersistence } from "./GameStatePersistence";
import { InventoryPersistence } from "./InventoryPersistence";
import { ProgressionPersistence } from "./ProgressionPersistence";

/** Honest in-memory fake of the WorldSaveStore port (mirrors the pattern in
 *  InventoryPersistence.test.ts / ProgressionPersistence.test.ts). */
class FakeWorldSaveStore implements WorldSaveStore {
  private readonly worlds = new Map<WorldId, WorldSaveData>();

  save(save: WorldSaveData): Promise<Result<void, SaveError>> {
    this.worlds.set(save.worldId, structuredClone(save));
    return Promise.resolve(ok(undefined));
  }

  load(worldId: WorldId): Promise<Result<WorldSaveData, SaveError>> {
    const found = this.worlds.get(worldId);
    if (!found) {
      return Promise.resolve({ ok: false, error: { kind: "NotFound", worldId } });
    }
    return Promise.resolve(ok(structuredClone(found)));
  }

  list(): Promise<Result<readonly WorldSummary[], SaveError>> {
    return Promise.resolve(ok([...this.worlds.values()].map(summarize)));
  }

  delete(worldId: WorldId): Promise<Result<void, SaveError>> {
    if (!this.worlds.delete(worldId)) {
      return Promise.resolve({ ok: false, error: { kind: "NotFound", worldId } });
    }
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

const registry = (() => {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

describe("GameStatePersistence", () => {
  it("loads nulls for a brand-new owner on a freshly-created world", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new GameStatePersistence({
      inventoryPersistence: new InventoryPersistence(store, registry),
      progressionPersistence: new ProgressionPersistence(store),
    });

    const loaded = await persistence.load("w1", "local");
    expect(loaded).toEqual({ inventory: null, progression: null, keyhints: null, character: null });
  });

  it("reports character: null when no characterPersistence dep is wired (TerrainScene's existing call site)", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new GameStatePersistence({
      inventoryPersistence: new InventoryPersistence(store, registry),
      progressionPersistence: new ProgressionPersistence(store),
    });

    // save() with no character arg, and no characterPersistence dep, must not throw
    await persistence.save("w1", "local", Inventory.empty(registry, 6), emptyProgression(), emptyKeyhintState());
    const loaded = await persistence.load("w1", "local");
    expect(loaded.character).toBeNull();
  });

  it("round-trips a character when characterPersistence is wired", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new GameStatePersistence({
      inventoryPersistence: new InventoryPersistence(store, registry),
      progressionPersistence: new ProgressionPersistence(store),
      characterPersistence: new CharacterPersistence(store),
    });

    let character = newCharacter();
    character = grantCharacterXp(character, xpForLevel(1)).character;
    const spent = allocateStatPoint(character, "might");
    if (!isOk(spent)) throw new Error("setup");
    character = spent.value;

    await persistence.save(
      "w1",
      "local",
      Inventory.empty(registry, 6),
      emptyProgression(),
      emptyKeyhintState(),
      character,
    );
    const loaded = await persistence.load("w1", "local");
    expect(loaded.character?.level.level).toBe(2);
    expect(loaded.character?.stats.attributes.might).toBe(1);
  });

  it("round-trips inventory + progression + keyhints through save/load", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new GameStatePersistence({
      inventoryPersistence: new InventoryPersistence(store, registry),
      progressionPersistence: new ProgressionPersistence(store),
    });

    let inv = Inventory.empty(registry, 6);
    const added = inv.add("wood", 12);
    if (!isOk(added)) throw new Error("setup");
    inv = added.value;

    const progResult = recordProgressionEvent(emptyProgression(), "craft", TUTORIAL_OBJECTIVES, ACHIEVEMENTS);
    const progression = progResult.state;
    const keyhints = markKeyhintShown(emptyKeyhintState(), "eat");

    await persistence.save("w1", "local", inv, progression, keyhints);
    const loaded = await persistence.load("w1", "local");

    expect(loaded.inventory?.count("wood")).toBe(12);
    expect(loaded.progression?.counts).toEqual(progression.counts);
    expect(loaded.keyhints?.shown).toEqual(["eat"]);
  });

  it("save() never throws when the target world doesn't exist (best-effort)", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new GameStatePersistence({
      inventoryPersistence: new InventoryPersistence(store, registry),
      progressionPersistence: new ProgressionPersistence(store),
    });
    await expect(
      persistence.save("missing", "local", Inventory.empty(registry, 6), emptyProgression(), emptyKeyhintState()),
    ).resolves.toBeUndefined();
  });
});
