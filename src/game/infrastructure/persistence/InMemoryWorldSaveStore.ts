/**
 * In-memory WorldSaveStore — a contract-obeying honest fake, not a mock. Used
 * by tests and as the offline/loopback store until the OPFS+IndexedDB adapter
 * lands (M2.1). It deep-clones on the way in and out so callers can't mutate
 * stored state through a shared reference (mirrors the serialize/deserialize
 * boundary a real store crosses).
 */

import { err, ok, type Result } from "../../domain/Result";
import type {
  WorldId,
  WorldSaveData,
  WorldSummary,
} from "../../domain/world/WorldSaveData";
import { summarize } from "../../domain/world/WorldSaveData";
import type {
  SaveError,
  WorldSaveStore,
} from "../../application/ports/WorldSaveStore";

function clone(save: WorldSaveData): WorldSaveData {
  return {
    ...save,
    modifiedChunks: save.modifiedChunks.map((c) => ({
      ...c,
      data: new Uint8Array(c.data),
    })),
    entities: structuredClone(save.entities),
    inventories: structuredClone(save.inventories),
    playerState: { ...save.playerState },
  };
}

export class InMemoryWorldSaveStore implements WorldSaveStore {
  private readonly worlds = new Map<WorldId, WorldSaveData>();

  save(save: WorldSaveData): Promise<Result<void, SaveError>> {
    this.worlds.set(save.worldId, clone(save));
    return Promise.resolve(ok(undefined));
  }

  load(worldId: WorldId): Promise<Result<WorldSaveData, SaveError>> {
    const found = this.worlds.get(worldId);
    if (!found) return Promise.resolve(err({ kind: "NotFound", worldId }));
    return Promise.resolve(ok(clone(found)));
  }

  list(): Promise<Result<readonly WorldSummary[], SaveError>> {
    const summaries = [...this.worlds.values()]
      .map(summarize)
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    return Promise.resolve(ok(summaries));
  }

  delete(worldId: WorldId): Promise<Result<void, SaveError>> {
    if (!this.worlds.delete(worldId)) {
      return Promise.resolve(err({ kind: "NotFound", worldId }));
    }
    return Promise.resolve(ok(undefined));
  }
}
