/**
 * Pure factory for a brand-new world save: an empty delta set at the world
 * origin, stamped once. Shared by the Solo (chosen/new seed) and Host (saved
 * seed) flows so world creation lives in one tested place, not duplicated in
 * two controllers.
 */

import type { WorldId, WorldSaveData } from "./WorldSaveData";

export interface NewWorldParams {
  readonly worldId: WorldId;
  readonly seed: number;
  readonly name: string;
  readonly now: number;
}

/**
 * Structure/POI worldgen version stamp (E6.2) — carried in the generic
 * `entities` bag (not a typed `WorldSaveData` field) precisely because that
 * bag already exists for exactly this "sibling subsystem writes a key,
 * VoxelTerrain persists it" purpose (see `treasure.discovered`,
 * `placement.pieces`). A save with no `worldgen.version` entity predates this
 * slice and never streams structures — `StructureField` only attaches for
 * worlds stamped `>= 2` (see the TerrainScene wiring comment). Number chosen
 * to line up with the plan's "version 2 = new worldgen features" intent;
 * reconcile with E6.1 caves' own stamp (if it lands as a typed field instead)
 * when the two branches merge.
 */
export const WORLDGEN_VERSION = 2;
export const WORLDGEN_VERSION_KEY = "worldgen.version";

export function createNewWorldSave(params: NewWorldParams): WorldSaveData {
  return {
    worldId: params.worldId,
    seed: params.seed,
    name: params.name,
    createdAt: params.now,
    modifiedAt: params.now,
    modifiedChunks: [],
    entities: { [WORLDGEN_VERSION_KEY]: WORLDGEN_VERSION },
    inventories: {},
    progression: {},
    playerState: { position: [0, 0, 0], yaw: 0, pitch: 0 },
  };
}
