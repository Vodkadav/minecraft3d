import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok, type Result } from "../domain/Result";
import { Inventory } from "../domain/inventory/Inventory";
import { ItemRegistry } from "../domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../domain/items/starterItems";
import { summarize, type WorldId, type WorldSaveData, type WorldSummary } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import { InventoryPersistence } from "./InventoryPersistence";

/**
 * A contract-obeying honest fake of the WorldSaveStore port. The real in-memory
 * adapter lives in infrastructure and cannot be imported here — dependency-cruiser
 * forbids an application-layer module (this test included) from reaching down into
 * infrastructure. This fake mirrors the adapter's clone-on-write/read semantics so
 * the use case is exercised against the same contract (test-honest-fakes-over-mocks).
 */
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

const registry = (() => {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

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
    playerState: { position: [0, 64, 0], yaw: 0, pitch: 0 },
    ...overrides,
  };
}

function seeded(): Inventory {
  let inv = Inventory.empty(registry, 6);
  for (const [id, n] of [
    ["wood", 20],
    ["ore", 5],
    ["pickaxe", 1],
  ] as const) {
    const r = inv.add(id, n);
    if (!isOk(r)) throw new Error(`seed ${id}`);
    inv = r.value;
  }
  return inv;
}

describe("InventoryPersistence", () => {
  it("round-trips an inventory through the save store", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new InventoryPersistence(store, registry);

    const saved = await persistence.saveInventory("w1", "player", seeded());
    expect(isOk(saved)).toBe(true);

    const loaded = await persistence.loadInventory("w1", "player");
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.value.capacity).toBe(6);
      expect(loaded.value.count("wood")).toBe(20);
      expect(loaded.value.count("ore")).toBe(5);
      expect(loaded.value.count("pickaxe")).toBe(1);
    }
  });

  it("keeps distinct owners' inventories separate", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new InventoryPersistence(store, registry);

    await persistence.saveInventory("w1", "player", seeded());
    let chest = Inventory.empty(registry, 3);
    const add = chest.add("stone", 8);
    if (isOk(add)) chest = add.value;
    await persistence.saveInventory("w1", "chest-1", chest);

    const player = await persistence.loadInventory("w1", "player");
    const box = await persistence.loadInventory("w1", "chest-1");
    if (isOk(player)) expect(player.value.count("wood")).toBe(20);
    if (isOk(box)) {
      expect(box.value.count("stone")).toBe(8);
      expect(box.value.count("wood")).toBe(0);
    }
  });

  it("does not disturb other save fields when writing an inventory", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ seed: 777, entities: { goblin: { hp: 3 } } }));
    const persistence = new InventoryPersistence(store, registry);

    await persistence.saveInventory("w1", "player", seeded());

    const reloaded = await store.load("w1");
    if (isOk(reloaded)) {
      expect(reloaded.value.seed).toBe(777);
      expect(reloaded.value.entities).toEqual({ goblin: { hp: 3 } });
    }
  });

  it("reports NoInventory for an owner that was never saved", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld());
    const persistence = new InventoryPersistence(store, registry);

    const loaded = await persistence.loadInventory("w1", "ghost");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NoInventory");
  });

  it("propagates NotFound when the world does not exist", async () => {
    const store = new FakeWorldSaveStore();
    const persistence = new InventoryPersistence(store, registry);

    const saved = await persistence.saveInventory("missing", "player", seeded());
    expect(isErr(saved)).toBe(true);
    if (isErr(saved)) expect(saved.error.kind).toBe("NotFound");

    const loaded = await persistence.loadInventory("missing", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("NotFound");
  });

  it("reports CorruptInventory for a malformed stored blob", async () => {
    const store = new FakeWorldSaveStore();
    await store.save(aWorld({ inventories: { player: { capacity: "nope", slots: 5 } } }));
    const persistence = new InventoryPersistence(store, registry);

    const loaded = await persistence.loadInventory("w1", "player");
    expect(isErr(loaded)).toBe(true);
    if (isErr(loaded)) expect(loaded.error.kind).toBe("CorruptInventory");
  });
});
