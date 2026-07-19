/**
 * Use case: round-trip an owner's discovered-map-cell set (Phase E3.1)
 * through the world save. Mirrors `CharacterPersistence` exactly — reads/
 * writes the open `WorldSaveData.exploration` map keyed by owner id, depends
 * only on the {@link WorldSaveStore} port, and treats the untyped blob as a
 * trust boundary (err-explicit-result-handling) rather than trusting its
 * shape.
 *
 * `WorldSaveData.exploration` is optional (added after the save shape
 * already existed) — a world saved before this phase, or an owner who never
 * moved (never revealed a cell), simply has no record; `load` reports that
 * as `NoExploration` rather than a corrupt-data error, and the composition
 * root falls back to `emptyExploration()` (nothing regresses for an
 * existing save).
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import { emptyExploration, type ExplorationState } from "../domain/map/Exploration";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

interface SerializedExploration {
  readonly cellMeters: number;
  readonly discovered: readonly string[];
}

export type ExplorationLoadError =
  | SaveError
  | { readonly kind: "NoExploration"; readonly ownerId: string }
  | { readonly kind: "CorruptExploration"; readonly ownerId: string; readonly detail: string };

function serialize(state: ExplorationState): SerializedExploration {
  return { cellMeters: state.cellMeters, discovered: Array.from(state.discovered) };
}

const CELL_KEY_PATTERN = /^-?\d+,-?\d+$/;

function parse(raw: unknown, ownerId: string): Result<SerializedExploration, ExplorationLoadError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "CorruptExploration", ownerId, detail: "not an exploration record" });
  }
  const record = raw as Partial<SerializedExploration>;
  if (typeof record.cellMeters !== "number" || !Number.isFinite(record.cellMeters) || record.cellMeters <= 0) {
    return err({ kind: "CorruptExploration", ownerId, detail: "bad cellMeters" });
  }
  if (!Array.isArray(record.discovered) || !record.discovered.every((k) => typeof k === "string" && CELL_KEY_PATTERN.test(k))) {
    return err({ kind: "CorruptExploration", ownerId, detail: "bad discovered cell list" });
  }
  return ok({ cellMeters: record.cellMeters, discovered: record.discovered });
}

function toState(s: SerializedExploration): ExplorationState {
  return { cellMeters: s.cellMeters, discovered: new Set(s.discovered) };
}

export class ExplorationPersistence {
  constructor(private readonly store: WorldSaveStore) {}

  async save(
    worldId: WorldId,
    ownerId: string,
    exploration: ExplorationState,
  ): Promise<Result<void, SaveError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const next = { ...(loaded.value.exploration ?? {}), [ownerId]: serialize(exploration) };
    return this.store.save({ ...loaded.value, exploration: next, modifiedAt: Date.now() });
  }

  async load(worldId: WorldId, ownerId: string): Promise<Result<ExplorationState, ExplorationLoadError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const raw = (loaded.value.exploration ?? {})[ownerId];
    if (raw === undefined) return err({ kind: "NoExploration", ownerId });

    const parsed = parse(raw, ownerId);
    if (!isOk(parsed)) return parsed;

    return ok(toState(parsed.value));
  }
}

/** Convenience default for a composition root that wants "load or empty"
 *  without branching on the Result itself (mirrors how CharacterScreen's
 *  caller falls back to `newCharacter()`). */
export async function loadExplorationOrEmpty(
  persistence: ExplorationPersistence,
  worldId: WorldId,
  ownerId: string,
): Promise<ExplorationState> {
  const loaded = await persistence.load(worldId, ownerId);
  return isOk(loaded) ? loaded.value : emptyExploration();
}
