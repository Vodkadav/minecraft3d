/**
 * World lifecycle glue between the M4 menu/lobby and the engine (plan M8 [O]).
 *
 * The menu/lobby produce a LoopbackSession carrying only a worldId. The engine
 * needs more to boot: the seed (procedural gen), the saved player pose (to
 * restore where the player left off), and the world's own id (so the M8 voxel
 * subsystem keys its dig deltas to THIS world instead of the per-seed demo id).
 * `launch` resolves a worldId into that descriptor by reading the WorldSaveStore;
 * `savePlayerState` writes the pose back on exit so the next launch restores it.
 *
 * Pure application logic over the WorldSaveStore port — the engine composition
 * root (src/main.ts, [F]) consumes `WorldLaunch` to actually start the world and
 * apply the pose to the FlyCamera. Expected failures are Result values.
 */

import { isErr, ok, type Result } from "../domain/Result";
import type {
  PlayerState,
  WorldId,
  WorldSaveData,
} from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

/** Everything the engine needs to boot a chosen world. */
export interface WorldLaunch {
  readonly worldId: WorldId;
  readonly seed: number;
  readonly name: string;
  readonly playerState: PlayerState;
  /** Full save incl. modified-chunk deltas, for the engine to restore. */
  readonly save: WorldSaveData;
}

export interface WorldLifecycleDeps {
  readonly clock?: () => number;
}

export class WorldLifecycle {
  private readonly clock: () => number;

  constructor(
    private readonly worlds: WorldSaveStore,
    deps: WorldLifecycleDeps = {},
  ) {
    this.clock = deps.clock ?? (() => Date.now());
  }

  /** Resolve a session's worldId into the engine boot descriptor. */
  async launch(worldId: WorldId): Promise<Result<WorldLaunch, SaveError>> {
    const loaded = await this.worlds.load(worldId);
    if (isErr(loaded)) return loaded;
    const save = loaded.value;
    return ok({
      worldId,
      seed: save.seed,
      name: save.name,
      playerState: save.playerState,
      save,
    });
  }

  /** Persist the player's pose (on exit / autosave) so the next launch restores it. */
  async savePlayerState(
    worldId: WorldId,
    playerState: PlayerState,
  ): Promise<Result<void, SaveError>> {
    const loaded = await this.worlds.load(worldId);
    if (isErr(loaded)) return loaded;
    const updated: WorldSaveData = {
      ...loaded.value,
      playerState,
      modifiedAt: this.clock(),
    };
    return this.worlds.save(updated);
  }
}
