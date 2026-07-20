import { describe, expect, it } from "vitest";
import { isOk } from "../../game/domain/Result";
import { ItemRegistry } from "../../game/domain/items/ItemRegistry";
import { STARTER_ITEMS } from "../../game/domain/items/starterItems";
import {
  structuresNear,
  STRUCTURE_CELL_M,
  structureTypeById,
} from "../../game/domain/worldgen/Structure";
import type { PlacedPiece } from "../placement/PlacedPieceRegistry";
import type { PlaceableInteractionHandle } from "../placement/PlaceableInteractionTool";
import type { PlacementToolHandle } from "../placement/PlacementTool";
import { attachStructureField } from "./StructureField";

const SEED = 42;
const SURFACE_Y = 50;

function makeRegistry(): ItemRegistry {
  const r = ItemRegistry.create(STARTER_ITEMS);
  if (!isOk(r)) throw new Error("registry setup failed");
  return r.value;
}

interface FakePlacement extends PlacementToolHandle {
  readonly commits: { pieceId: string; worldPos: readonly [number, number, number] }[];
  blockedPieceIds: Set<string>;
}

function makeFakePlacement(): FakePlacement {
  const commits: FakePlacement["commits"] = [];
  const blockedPieceIds = new Set<string>();
  let nextId = 1;
  return {
    commits,
    blockedPieceIds,
    update: () => undefined,
    isBuildMode: () => false,
    dispose: () => undefined,
    raycastAimedPiece: () => null,
    meshFor: () => undefined,
    listPieces: () => [],
    commitPieceAt: (pieceId, worldPos): PlacedPiece | null => {
      commits.push({ pieceId, worldPos });
      if (blockedPieceIds.has(pieceId)) return null;
      return { id: nextId++, pieceId, center: [...worldPos], orientation: [0, 0, 0, 1], cells: [] };
    },
  };
}

interface FakePlaceableInteraction extends PlaceableInteractionHandle {
  readonly appliedStates: { placeableId: string; state: unknown }[];
}

function makeFakePlaceableInteraction(): FakePlaceableInteraction {
  const appliedStates: FakePlaceableInteraction["appliedStates"] = [];
  return {
    appliedStates,
    update: () => undefined,
    hasInteractTarget: () => false,
    ensurePlaceable: () => undefined,
    forgetPlaceable: () => undefined,
    dispose: () => undefined,
    remote: false,
    onInteractIntent: null,
    onInventoryOpIntent: null,
    resolveHostIntent: () => undefined,
    applyRemoteState: (placeableId, state) => {
      appliedStates.push({ placeableId, state });
    },
    notifyInventoryChanged: () => undefined,
  };
}

function makeField(overrides: { player?: [number, number] } = {}) {
  const player: [number, number] = overrides.player ?? [0, 0];
  const placement = makeFakePlacement();
  const placeableInteraction = makeFakePlaceableInteraction();
  const stampedSets: string[][] = [];
  const field = attachStructureField({
    seed: SEED,
    surface: { heightAt: () => SURFACE_Y },
    registry: makeRegistry(),
    placement,
    placeableInteraction,
    getPlayerXZ: () => player,
    onStamped: (ids) => stampedSets.push([...ids]),
  });
  return { player, placement, placeableInteraction, stampedSets, field };
}

describe("attachStructureField — stamping", () => {
  it("commits every piece of every structure within radius on first update", () => {
    const h = makeField();
    h.field.update();
    const near = structuresNear(SEED, 0, 0, { heightAt: () => SURFACE_Y }, 2);
    expect(near.length).toBeGreaterThan(0);
    const expectedPieceCount = near.reduce(
      (n, s) => n + (structureTypeById(s.typeId)?.pieces.length ?? 0),
      0,
    );
    expect(h.placement.commits).toHaveLength(expectedPieceCount);
    expect(h.field.stampedCount).toBe(near.length);
  });

  it("never re-stamps a structure already in the stamped set", () => {
    const near = structuresNear(SEED, 0, 0, { heightAt: () => SURFACE_Y }, 2);
    const target = near[0]!;
    const placement = makeFakePlacement();
    const placeableInteraction = makeFakePlaceableInteraction();
    const field = attachStructureField({
      seed: SEED,
      surface: { heightAt: () => SURFACE_Y },
      registry: makeRegistry(),
      placement,
      placeableInteraction,
      getPlayerXZ: () => [0, 0],
      stamped: [target.id],
      onStamped: () => undefined,
    });
    field.update();
    // the already-stamped target's own pieces are never committed again —
    // verify by counting: total commits < a fresh field's commit count
    const fresh = makeFakePlacement();
    attachStructureField({
      seed: SEED,
      surface: { heightAt: () => SURFACE_Y },
      registry: makeRegistry(),
      placement: fresh,
      placeableInteraction: makeFakePlaceableInteraction(),
      getPlayerXZ: () => [0, 0],
      onStamped: () => undefined,
    }).update();
    expect(placement.commits.length).toBeLessThan(fresh.commits.length);
  });

  it("skips just the blocked piece, not the whole structure", () => {
    const h = makeField();
    h.placement.blockedPieceIds.add("campfire");
    h.field.update();
    // some pieces still committed even though campfire attempts were blocked
    const attempted = h.placement.commits.filter((c) => c.pieceId === "campfire");
    expect(attempted.length).toBeGreaterThan(0);
    const nonCampfireCommitted = h.placement.commits.filter((c) => c.pieceId !== "campfire");
    expect(nonCampfireCommitted.length).toBeGreaterThan(0);
  });

  it("fills a stamped chest's loot from the structure's rolled reward", () => {
    const h = makeField();
    h.field.update();
    const near = structuresNear(SEED, 0, 0, { heightAt: () => SURFACE_Y }, 2);
    const withLoot = near.find((s) => (structureTypeById(s.typeId)?.loot?.rolls.length ?? 0) > 0);
    if (!withLoot) return; // no loot structure in this window — nothing to assert
    expect(h.placeableInteraction.appliedStates.length).toBeGreaterThan(0);
    const applied = h.placeableInteraction.appliedStates[0]!.state as { slots: unknown[] };
    expect(applied.slots.some((s) => s !== null)).toBe(true);
  });

  it("persists the growing stamped id set via onStamped", () => {
    const h = makeField();
    h.field.update();
    expect(h.stampedSets.length).toBeGreaterThan(0);
    const last = h.stampedSets[h.stampedSets.length - 1]!;
    expect(last.length).toBe(h.field.stampedCount);
  });

  it("skips the cell-window scan while the player stays inside one structure cell", () => {
    const h = makeField();
    h.field.update();
    const before = h.placement.commits.length;
    h.player[0] += STRUCTURE_CELL_M / 4;
    h.field.update();
    expect(h.placement.commits.length).toBe(before);
  });

  it("exposes stamped structures as POI markers", () => {
    const h = makeField();
    h.field.update();
    const markers = h.field.liveMarkers();
    expect(markers.length).toBe(h.field.stampedCount);
    for (const m of markers) {
      expect(Number.isFinite(m.x)).toBe(true);
      expect(Number.isFinite(m.z)).toBe(true);
    }
  });
});
