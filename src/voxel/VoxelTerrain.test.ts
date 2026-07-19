// @vitest-environment happy-dom
/**
 * VoxelTerrain persistence contract: world-id keying (explicit id vs the
 * voxeldev prefix form) and saveNow preservation — a voxel save must never
 * clobber the world's name, inventories, saved pose, or foreign entities.
 * Meshing math is covered by SurfaceExtractor/VoxelVolume tests; the store is
 * the honest in-memory fake.
 */
import { describe, expect, it } from "vitest";
import type { PlayerState, WorldSaveData } from "../game/domain/world/WorldSaveData";
import { InMemoryWorldSaveStore } from "../game/infrastructure/persistence/InMemoryWorldSaveStore";
import { DigMask } from "./DigMask";
import { VoxelTerrain, type VoxelSurface } from "./VoxelTerrain";

const SURFACE: VoxelSurface = { heightAt: () => 10 };
const POSE: PlayerState = { position: [12, 34, 56], yaw: 1.2, pitch: -0.3 };

function existingSave(worldId: string, seed: number): WorldSaveData {
  return {
    worldId,
    seed,
    name: "My World",
    createdAt: 1000,
    modifiedAt: 2000,
    modifiedChunks: [],
    entities: { "quest.flags": ["intro-done"] },
    inventories: { backpack: { slots: [] } },
    progression: {},
    playerState: POSE,
  };
}

async function loadSave(store: InMemoryWorldSaveStore, worldId: string) {
  const r = await store.load(worldId);
  if (!r.ok) throw new Error(`no save under ${worldId}: ${r.error.kind}`);
  return r.value;
}

describe("VoxelTerrain world-id keying", () => {
  it("keys saves under the per-seed prefix id by default (voxeldev form)", async () => {
    const store = new InMemoryWorldSaveStore();
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 42, store);
    await voxels.init();
    voxels.carveAt(0, 10, 0, 2);
    await voxels.flushSave();
    await loadSave(store, "voxel-demo-42"); // throws if keyed elsewhere
  });

  it("keys saves under an explicit worldId when supplied (menu launch)", async () => {
    const store = new InMemoryWorldSaveStore();
    await store.save(existingSave("w1", 42));
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 42, store, "voxel-demo", {
      worldId: "w1",
    });
    await voxels.init();
    voxels.carveAt(0, 10, 0, 2);
    await voxels.flushSave();
    const saved = await loadSave(store, "w1");
    expect(saved.modifiedChunks.length).toBeGreaterThan(0);
  });
});

describe("VoxelTerrain.onLocalEdit (M7 net seam)", () => {
  it("reports carves and fills as WorldEdits when wired", () => {
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 1, null);
    const edits: unknown[] = [];
    voxels.onLocalEdit = (e) => edits.push(e);

    voxels.carveAt(1, 10, 2, 1.5);
    voxels.fillAt(3, 10, 4, 1.2, 5);

    expect(edits).toEqual([
      { op: "dig", x: 1, y: 10, z: 2, radius: 1.5 },
      { op: "fill", x: 3, y: 10, z: 4, radius: 1.2, materialId: 5 },
    ]);
  });

  it("is silent when not wired (default solo behavior)", () => {
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 1, null);
    expect(() => voxels.carveAt(0, 10, 0, 1)).not.toThrow();
  });
});

describe("VoxelTerrain dig-mask economy", () => {
  // surface sits at y=10 (SURFACE fake); mask slots are scarce (128) so only
  // carves that can actually cut the surface sheet may record a hole sphere
  it("records a mask sphere for a carve that intersects the surface", () => {
    const mask = new DigMask();
    const voxels = new VoxelTerrain(SURFACE, mask, 1, null);
    voxels.carveAt(0, 10, 0, 2);
    expect(mask.toFlatArray().length).toBe(4);
  });

  it("records no mask sphere for a deep underground carve", () => {
    const mask = new DigMask();
    const voxels = new VoxelTerrain(SURFACE, mask, 1, null);
    voxels.carveAt(0, -20, 0, 2); // 30 m under the surface
    expect(mask.toFlatArray().length).toBe(0);
  });

  it("records no mask sphere for a carve entirely above the surface", () => {
    const mask = new DigMask();
    const voxels = new VoxelTerrain(SURFACE, mask, 1, null);
    voxels.carveAt(0, 40, 0, 2);
    expect(mask.toFlatArray().length).toBe(0);
  });
});

describe("VoxelTerrain.saveNow preservation", () => {
  async function carvedAndSaved(opts: { poseProvider?: () => PlayerState } = {}) {
    const store = new InMemoryWorldSaveStore();
    await store.save(existingSave("w1", 42));
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 42, store, "voxel-demo", {
      worldId: "w1",
      ...opts,
    });
    await voxels.init();
    voxels.carveAt(0, 10, 0, 2);
    await voxels.flushSave();
    return loadSave(store, "w1");
  }

  it("preserves the loaded save's name, inventories, and playerState", async () => {
    const saved = await carvedAndSaved();
    expect(saved.name).toBe("My World");
    expect(saved.inventories).toEqual({ backpack: { slots: [] } });
    expect(saved.playerState).toEqual(POSE);
    expect(saved.createdAt).toBe(1000);
  });

  it("preserves foreign entities keys while owning voxel.digSpheres", async () => {
    const saved = await carvedAndSaved();
    expect(saved.entities["quest.flags"]).toEqual(["intro-done"]);
    const spheres = saved.entities["voxel.digSpheres"];
    expect(Array.isArray(spheres)).toBe(true);
    expect((spheres as number[]).length).toBeGreaterThan(0);
  });

  it("writes the LIVE pose when a poseProvider is wired", async () => {
    const live: PlayerState = { position: [99, 20, -7], yaw: 0.4, pitch: 0.1 };
    const saved = await carvedAndSaved({ poseProvider: () => live });
    expect(saved.playerState).toEqual(live);
  });

  it("round-trips sibling-subsystem entities via entity()/setEntity()", async () => {
    const store = new InMemoryWorldSaveStore();
    await store.save(existingSave("w1", 42));
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 42, store, "voxel-demo", {
      worldId: "w1",
    });
    await voxels.init();
    expect(voxels.entity("quest.flags")).toEqual(["intro-done"]);
    expect(voxels.entity("placement.pieces")).toBeUndefined();

    voxels.setEntity("placement.pieces", { pieces: [1, 2] });
    expect(voxels.entity("placement.pieces")).toEqual({ pieces: [1, 2] });
    await voxels.flushSave();

    const saved = await loadSave(store, "w1");
    expect(saved.entities["placement.pieces"]).toEqual({ pieces: [1, 2] });
    expect(saved.entities["quest.flags"]).toEqual(["intro-done"]); // foreign key intact
  });

  it("setEntity works on a fresh world with no prior save", async () => {
    const store = new InMemoryWorldSaveStore();
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 7, store);
    await voxels.init();
    voxels.setEntity("treasure.discovered", { claimed: ["t1"] });
    await voxels.flushSave();
    const saved = await loadSave(store, "voxel-demo-7");
    expect(saved.entities["treasure.discovered"]).toEqual({ claimed: ["t1"] });
  });

  it("keeps default fields for a fresh (NotFound) world", async () => {
    const store = new InMemoryWorldSaveStore();
    const voxels = new VoxelTerrain(SURFACE, new DigMask(), 7, store);
    await voxels.init();
    voxels.carveAt(0, 10, 0, 2);
    await voxels.flushSave();
    const saved = await loadSave(store, "voxel-demo-7");
    expect(saved.playerState).toEqual({ position: [0, 0, 0], yaw: 0, pitch: 0 });
    expect(saved.inventories).toEqual({});
  });
});
