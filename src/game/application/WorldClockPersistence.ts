/**
 * Use case: round-trip the world's live time-of-day clock through the world
 * save (Workstream E0.3). The clock is world-global (not owner-keyed), so it
 * rides the existing `WorldSaveData.entities` open record — the SAME
 * non-breaking-extension mechanism `VoxelTerrain` already uses for
 * `'voxel.digSpheres'` — instead of adding a new top-level save field. That
 * choice matters: menu-launched worlds save through `VoxelTerrain.saveNow`
 * (debounced, preserves+merges `entities`), not through this port directly;
 * riding `entities` lets `VoxelTerrain.setEntity` carry the live hour through
 * that path with no engine-file edit, while this class remains the port for
 * worlds that DON'T route through the voxel subsystem. Depends only on the
 * {@link WorldSaveStore} port; treats the stored blob as a trust boundary
 * (err-explicit-result-handling) rather than assuming its shape.
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import { createWorldClock, type WorldClock } from "../domain/time/WorldClock";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

/** The entities-bag key the live clock hour is stored under. */
export const WORLD_CLOCK_ENTITY_KEY = "world.clock";

export type WorldClockLoadError =
  | SaveError
  | { readonly kind: "NoWorldClock" }
  | { readonly kind: "CorruptWorldClock"; readonly detail: string };

function parse(raw: unknown): Result<WorldClock, WorldClockLoadError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "CorruptWorldClock", detail: "not a world-clock record" });
  }
  const hour = (raw as { hour?: unknown }).hour;
  if (typeof hour !== "number" || !Number.isFinite(hour)) {
    return err({ kind: "CorruptWorldClock", detail: "bad hour value" });
  }
  return ok(createWorldClock(hour));
}

/** Pure best-effort read straight off an already-loaded save's `entities` bag
 *  (e.g. `WorldLaunch.save.entities`) — null on missing/corrupt, never throws;
 *  used by the composition root when it already has the save in hand. */
export function readWorldClockHour(entities: Readonly<Record<string, unknown>>): number | null {
  const raw = entities[WORLD_CLOCK_ENTITY_KEY];
  if (raw === undefined) return null;
  const parsed = parse(raw);
  return isOk(parsed) ? parsed.value.hour : null;
}

export class WorldClockPersistence {
  constructor(private readonly store: WorldSaveStore) {}

  async save(worldId: WorldId, clock: WorldClock): Promise<Result<void, SaveError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    return this.store.save({
      ...loaded.value,
      entities: { ...loaded.value.entities, [WORLD_CLOCK_ENTITY_KEY]: { hour: clock.hour } },
      modifiedAt: Date.now(),
    });
  }

  async load(worldId: WorldId): Promise<Result<WorldClock, WorldClockLoadError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const raw = loaded.value.entities[WORLD_CLOCK_ENTITY_KEY];
    if (raw === undefined) return err({ kind: "NoWorldClock" });
    return parse(raw);
  }
}
