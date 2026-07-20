/**
 * Pure factory for a brand-new world save: an empty delta set at the world
 * origin, stamped once. Shared by the Solo (chosen/new seed) and Host (saved
 * seed) flows so world creation lives in one tested place, not duplicated in
 * two controllers.
 */

import { CAVES_WORLDGEN_VERSION } from "../voxel/CaveSeeding";
import type { WorldId, WorldSaveData } from "./WorldSaveData";

export interface NewWorldParams {
  readonly worldId: WorldId;
  readonly seed: number;
  readonly name: string;
  readonly now: number;
}

export function createNewWorldSave(params: NewWorldParams): WorldSaveData {
  return {
    worldId: params.worldId,
    seed: params.seed,
    name: params.name,
    createdAt: params.now,
    modifiedAt: params.now,
    modifiedChunks: [],
    entities: {},
    inventories: {},
    progression: {},
    playerState: { position: [0, 0, 0], yaw: 0, pitch: 0 },
    // brand-new worlds opt into cave carving from creation (E6.1) — see
    // WorldSaveData.worldgenVersion.
    worldgenVersion: CAVES_WORLDGEN_VERSION,
  };
}
