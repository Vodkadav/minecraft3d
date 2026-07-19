/**
 * Use case: round-trip an owner's progression state through the world save
 * (Workstream 6). Mirrors `InventoryPersistence` exactly — reads/writes the
 * open `WorldSaveData.progression` map keyed by owner id, depends only on the
 * {@link WorldSaveStore} port, and treats the untyped blob as a trust
 * boundary (err-explicit-result-handling) rather than trusting its shape.
 *
 * This is the tested persistence *seam*; wiring it into the boot/save flow
 * is deferred the same way S4 deferred wiring `InventoryPersistence` itself
 * (see PROGRESS.md / the aaa-polish orchestrator log) — neither is called
 * from TerrainScene yet.
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import type { KeyhintId, KeyhintState } from "../domain/progression/Keyhints";
import type { ProgressionState } from "../domain/progression/ProgressionState";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

export interface SerializedProgression {
  readonly counts: Readonly<Record<string, number>>;
  readonly completedObjectives: readonly string[];
  readonly unlockedAchievements: readonly string[];
  readonly tutorialSkipped: boolean;
  readonly shownKeyhints: readonly string[];
}

export type ProgressionLoadError =
  | SaveError
  | { readonly kind: "NoProgression"; readonly ownerId: string }
  | { readonly kind: "CorruptProgression"; readonly ownerId: string; readonly detail: string };

function serialize(progression: ProgressionState, keyhints: KeyhintState): SerializedProgression {
  return {
    counts: progression.counts,
    completedObjectives: progression.completedObjectives,
    unlockedAchievements: progression.unlockedAchievements,
    tutorialSkipped: progression.tutorialSkipped,
    shownKeyhints: keyhints.shown,
  };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parse(
  raw: unknown,
  ownerId: string,
): Result<SerializedProgression, ProgressionLoadError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "CorruptProgression", ownerId, detail: "not a progression record" });
  }
  const record = raw as Partial<SerializedProgression>;
  if (
    typeof record.counts !== "object" ||
    record.counts === null ||
    !isStringArray(record.completedObjectives) ||
    !isStringArray(record.unlockedAchievements) ||
    typeof record.tutorialSkipped !== "boolean" ||
    !isStringArray(record.shownKeyhints)
  ) {
    return err({ kind: "CorruptProgression", ownerId, detail: "bad progression shape" });
  }
  for (const v of Object.values(record.counts)) {
    if (typeof v !== "number") {
      return err({ kind: "CorruptProgression", ownerId, detail: "non-numeric count" });
    }
  }
  return ok({
    counts: record.counts as Record<string, number>,
    completedObjectives: record.completedObjectives,
    unlockedAchievements: record.unlockedAchievements,
    tutorialSkipped: record.tutorialSkipped,
    shownKeyhints: record.shownKeyhints,
  });
}

export class ProgressionPersistence {
  constructor(private readonly store: WorldSaveStore) {}

  async save(
    worldId: WorldId,
    ownerId: string,
    progression: ProgressionState,
    keyhints: KeyhintState,
  ): Promise<Result<void, SaveError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const next = {
      ...loaded.value.progression,
      [ownerId]: serialize(progression, keyhints),
    };
    return this.store.save({ ...loaded.value, progression: next, modifiedAt: Date.now() });
  }

  async load(
    worldId: WorldId,
    ownerId: string,
  ): Promise<Result<{ progression: ProgressionState; keyhints: KeyhintState }, ProgressionLoadError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const raw = loaded.value.progression[ownerId];
    if (raw === undefined) return err({ kind: "NoProgression", ownerId });

    const parsed = parse(raw, ownerId);
    if (!isOk(parsed)) return parsed;

    const counts = parsed.value.counts as ProgressionState["counts"];
    return ok({
      progression: {
        counts,
        completedObjectives: parsed.value.completedObjectives,
        unlockedAchievements: parsed.value.unlockedAchievements,
        tutorialSkipped: parsed.value.tutorialSkipped,
      },
      keyhints: { shown: parsed.value.shownKeyhints as readonly KeyhintId[] },
    });
  }
}
