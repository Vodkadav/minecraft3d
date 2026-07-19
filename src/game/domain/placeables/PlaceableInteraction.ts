/**
 * The single pure resolver every placeable interaction funnels through
 * (Workstream 8.1 wiring, S7b) — dispatches a `PlaceableAction` onto the
 * right domain module (Door/Campfire/Farming/ChestTransfer) by the placed
 * piece's `pieceId`, and folds the result back into the `PlaceableStore`.
 * Solo play calls this directly; multiplayer's `HostSession.onPlaceableInteract`
 * hook calls the exact same function — joiners never mutate placeable state
 * locally (Invariant 6). Rejections (locked door, no recipe, not ready, chest
 * full/empty) return `null`, mirroring the dig/fill "drop silently" contract.
 */

import { isOk } from "../Result";
import type { ItemRegistry } from "../items/ItemRegistry";
import type { Recipe } from "../crafting/Crafting";
import type { PlaceableAction } from "../net/Protocol";
import { collectCook, spawnCampfire, startCook, type CampfireState } from "./Campfire";
import { depositToChest, withdrawFromChest, type ChestState } from "./ChestTransfer";
import { spawnDoor, toggleDoor, type DoorState } from "./Door";
import { cropForSeed, emptyPlot, harvest, plant, type PlotState } from "../farming/Farming";
import { getPlaceable, setPlaceableState, type PlaceableStore } from "./PlaceableStore";

/** pieceId -> its default freshly-placed domain state (used both at commit
 *  time and to know which piece ids carry Workstream 8.1 state at all). */
export function defaultStateFor(pieceId: string): unknown {
  switch (pieceId) {
    case "door":
    case "gate":
      return spawnDoor();
    case "chest":
      return { capacity: 20, slots: Array.from({ length: 20 }, () => null) } satisfies ChestState;
    case "campfire":
      return spawnCampfire();
    case "plot":
      return emptyPlot();
    default:
      return null;
  }
}

export interface InteractContext {
  readonly itemId?: string;
  readonly count?: number;
  readonly now: number;
  readonly actorId: string;
  readonly registry: ItemRegistry;
  readonly recipes: readonly Recipe[];
  /** [0,1) — deterministic harvest-yield roll (caller supplies so the
   *  resolver stays pure; the host/solo call site owns randomness). */
  readonly roll: number;
}

export interface InteractOutcome {
  readonly store: PlaceableStore;
  /** An item the ACTOR receives as a direct result (cook/harvest output, a
   *  chest withdrawal) — the caller is responsible for granting it to the
   *  right inventory; this resolver never touches inventories itself. */
  readonly grant?: { readonly itemId: string; readonly count: number };
}

export function resolvePlaceableInteract(
  store: PlaceableStore,
  action: PlaceableAction,
  placeableId: string,
  ctx: InteractContext,
): InteractOutcome | null {
  const record = getPlaceable(store, placeableId);
  if (!record) return null;

  switch (record.pieceId) {
    case "door":
    case "gate":
      return resolveDoor(store, placeableId, record.state as DoorState, action, ctx);
    case "chest":
      return resolveChest(store, placeableId, record.state as ChestState, action, ctx);
    case "campfire":
      return resolveCampfire(store, placeableId, record.state as CampfireState, action, ctx);
    case "plot":
      return resolvePlot(store, placeableId, record.state as PlotState, action, ctx);
    default:
      return null;
  }
}

function resolveDoor(
  store: PlaceableStore,
  id: string,
  state: DoorState,
  action: PlaceableAction,
  ctx: InteractContext,
): InteractOutcome | null {
  if (action !== "toggleDoor") return null;
  const r = toggleDoor(state, ctx.actorId);
  if (!isOk(r)) return null;
  return { store: setPlaceableState(store, id, r.value) };
}

function resolveChest(
  store: PlaceableStore,
  id: string,
  state: ChestState,
  action: PlaceableAction,
  ctx: InteractContext,
): InteractOutcome | null {
  if (!ctx.itemId || !ctx.count) return null;
  if (action === "depositChest") {
    const r = depositToChest(state, ctx.registry, ctx.itemId, ctx.count);
    if (!isOk(r)) return null;
    return { store: setPlaceableState(store, id, r.value) };
  }
  if (action === "withdrawChest") {
    const r = withdrawFromChest(state, ctx.registry, ctx.itemId, ctx.count);
    if (!isOk(r)) return null;
    return {
      store: setPlaceableState(store, id, r.value.chest),
      grant: { itemId: r.value.itemId, count: r.value.count },
    };
  }
  return null;
}

function resolveCampfire(
  store: PlaceableStore,
  id: string,
  state: CampfireState,
  action: PlaceableAction,
  ctx: InteractContext,
): InteractOutcome | null {
  if (action === "startCook") {
    if (!ctx.itemId) return null;
    const r = startCook(state, ctx.recipes, ctx.itemId, ctx.now);
    if (!isOk(r)) return null;
    return { store: setPlaceableState(store, id, r.value) };
  }
  if (action === "collectCook") {
    const r = collectCook(state, ctx.now);
    if (!isOk(r)) return null;
    return {
      store: setPlaceableState(store, id, r.value.state),
      grant: { itemId: r.value.output.itemId, count: r.value.output.count },
    };
  }
  return null;
}

function resolvePlot(
  store: PlaceableStore,
  id: string,
  state: PlotState,
  action: PlaceableAction,
  ctx: InteractContext,
): InteractOutcome | null {
  if (action === "plantCrop") {
    if (!ctx.itemId) return null;
    const crop = cropForSeed(ctx.itemId);
    if (!crop) return null;
    const r = plant(state, crop.id, ctx.now);
    if (!isOk(r)) return null;
    return { store: setPlaceableState(store, id, r.value) };
  }
  if (action === "harvestCrop") {
    const r = harvest(state, ctx.now, ctx.roll);
    if (!isOk(r)) return null;
    return {
      store: setPlaceableState(store, id, r.value.plot),
      grant: { itemId: r.value.output.itemId, count: r.value.output.count },
    };
  }
  return null;
}
