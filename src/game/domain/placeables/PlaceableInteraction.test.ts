import { describe, expect, it } from "vitest";
import { isOk } from "../Result";
import { ItemRegistry } from "../items/ItemRegistry";
import { STARTER_ITEMS } from "../items/starterItems";
import { STARTER_RECIPES } from "../crafting/starterRecipes";
import { spawnDoor } from "./Door";
import { spawnCampfire } from "./Campfire";
import { emptyPlot, isHarvestable, type PlotState } from "../farming/Farming";
import { emptyPlaceableStore, getPlaceable, upsertPlaceable } from "./PlaceableStore";
import { defaultStateFor, resolvePlaceableInteract, type InteractContext } from "./PlaceableInteraction";
import type { ChestState } from "./ChestTransfer";

const registry = (() => {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
})();

function ctx(overrides: Partial<InteractContext> = {}): InteractContext {
  return {
    now: 0,
    actorId: "player",
    registry,
    recipes: STARTER_RECIPES,
    roll: 0,
    ...overrides,
  };
}

describe("PlaceableInteraction: defaultStateFor", () => {
  it("returns a door/chest/campfire/plot default and null for structural pieces", () => {
    expect(defaultStateFor("door")).toEqual(spawnDoor());
    expect(defaultStateFor("campfire")).toEqual(spawnCampfire());
    expect(defaultStateFor("plot")).toEqual(emptyPlot());
    expect(defaultStateFor("wall")).toBeNull();
  });
});

describe("PlaceableInteraction: door", () => {
  it("toggles open/closed", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "door", spawnDoor());
    const r = resolvePlaceableInteract(store, "toggleDoor", "1", ctx());
    expect(r).not.toBeNull();
    expect(getPlaceable(r!.store, "1")?.state).toMatchObject({ open: true });
  });

  it("rejects toggling a door locked by someone else", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "door", {
      open: false,
      ownerId: "owner",
      locked: true,
    });
    const r = resolvePlaceableInteract(store, "toggleDoor", "1", ctx({ actorId: "stranger" }));
    expect(r).toBeNull();
  });

  it("returns null for an unknown placeable id", () => {
    expect(resolvePlaceableInteract(emptyPlaceableStore(), "toggleDoor", "ghost", ctx())).toBeNull();
  });
});

describe("PlaceableInteraction: chest", () => {
  function chestState(): ChestState {
    return defaultStateFor("chest") as ChestState;
  }

  it("deposits and withdraws by item id + count", () => {
    let store = upsertPlaceable(emptyPlaceableStore(), "1", "chest", chestState());
    const deposited = resolvePlaceableInteract(store, "depositChest", "1", ctx({ itemId: "wood", count: 10 }));
    expect(deposited).not.toBeNull();
    store = deposited!.store;

    const withdrawn = resolvePlaceableInteract(store, "withdrawChest", "1", ctx({ itemId: "wood", count: 4 }));
    expect(withdrawn).not.toBeNull();
    expect(withdrawn!.grant).toEqual({ itemId: "wood", count: 4 });
  });

  it("rejects a withdraw of more than the chest holds", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "chest", chestState());
    const r = resolvePlaceableInteract(store, "withdrawChest", "1", ctx({ itemId: "wood", count: 1 }));
    expect(r).toBeNull();
  });

  it("rejects a deposit missing itemId/count", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "chest", chestState());
    expect(resolvePlaceableInteract(store, "depositChest", "1", ctx())).toBeNull();
  });
});

describe("PlaceableInteraction: campfire", () => {
  it("starts and collects a cook job", () => {
    let store = upsertPlaceable(emptyPlaceableStore(), "1", "campfire", spawnCampfire());
    const started = resolvePlaceableInteract(store, "startCook", "1", ctx({ itemId: "meat", now: 0 }));
    expect(started).not.toBeNull();
    store = started!.store;

    const tooSoon = resolvePlaceableInteract(store, "collectCook", "1", ctx({ now: 1000 }));
    expect(tooSoon).toBeNull();

    const done = resolvePlaceableInteract(store, "collectCook", "1", ctx({ now: 12_000 }));
    expect(done).not.toBeNull();
    expect(done!.grant).toEqual({ itemId: "cooked-meat", count: 1 });
  });

  it("rejects starting a cook job with no matching recipe", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "campfire", spawnCampfire());
    const r = resolvePlaceableInteract(store, "startCook", "1", ctx({ itemId: "stone" }));
    expect(r).toBeNull();
  });
});

describe("PlaceableInteraction: farming plot", () => {
  it("plants a seed and harvests once grown", () => {
    let store = upsertPlaceable(emptyPlaceableStore(), "1", "plot", emptyPlot());
    const planted = resolvePlaceableInteract(store, "plantCrop", "1", ctx({ itemId: "wheat-seed", now: 0 }));
    expect(planted).not.toBeNull();
    store = planted!.store;

    const plot = getPlaceable(store, "1")!.state as PlotState;
    expect(isHarvestable(plot, 1000)).toBe(false);

    const harvested = resolvePlaceableInteract(store, "harvestCrop", "1", ctx({ now: 200_000, roll: 0.5 }));
    expect(harvested).not.toBeNull();
    expect(harvested!.grant?.itemId).toBe("wheat");
  });

  it("rejects planting an unknown seed", () => {
    const store = upsertPlaceable(emptyPlaceableStore(), "1", "plot", emptyPlot());
    const r = resolvePlaceableInteract(store, "plantCrop", "1", ctx({ itemId: "stone" }));
    expect(r).toBeNull();
  });
});
