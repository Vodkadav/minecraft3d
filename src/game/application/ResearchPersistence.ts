/**
 * Use case: round-trip an owner's research-tree progress through the world
 * save. Mirrors `CharacterPersistence` exactly — reads/writes the open
 * `WorldSaveData.research` map keyed by owner id, depends only on the
 * {@link WorldSaveStore} port, and treats the untyped blob as a trust
 * boundary (err-explicit-result-handling) rather than trusting its shape.
 *
 * Single-player/host-local only, per-owner local storage (Phase E6.4) — a
 * joiner's research never syncs over the network today; see `GameHud.ts`'s
 * doc comment for the explicit multiplayer deferral.
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import type { ResearchState } from "../domain/research/ResearchTree";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

interface SerializedResearch {
  readonly unlockedNodeIds: readonly string[];
  readonly spentPoints: number;
}

export type ResearchLoadError =
  | SaveError
  | { readonly kind: "NoResearch"; readonly ownerId: string }
  | { readonly kind: "CorruptResearch"; readonly ownerId: string; readonly detail: string };

function serialize(research: ResearchState): SerializedResearch {
  return { unlockedNodeIds: research.unlockedNodeIds, spentPoints: research.spentPoints };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parse(raw: unknown, ownerId: string): Result<SerializedResearch, ResearchLoadError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "CorruptResearch", ownerId, detail: "not a research record" });
  }
  const record = raw as Partial<SerializedResearch>;
  if (!isStringArray(record.unlockedNodeIds) || typeof record.spentPoints !== "number") {
    return err({ kind: "CorruptResearch", ownerId, detail: "bad research shape" });
  }
  return ok({ unlockedNodeIds: record.unlockedNodeIds, spentPoints: record.spentPoints });
}

function toResearchState(s: SerializedResearch): ResearchState {
  return { unlockedNodeIds: s.unlockedNodeIds, spentPoints: s.spentPoints };
}

export class ResearchPersistence {
  constructor(private readonly store: WorldSaveStore) {}

  async save(
    worldId: WorldId,
    ownerId: string,
    research: ResearchState,
  ): Promise<Result<void, SaveError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const next = { ...(loaded.value.research ?? {}), [ownerId]: serialize(research) };
    return this.store.save({ ...loaded.value, research: next, modifiedAt: Date.now() });
  }

  async load(worldId: WorldId, ownerId: string): Promise<Result<ResearchState, ResearchLoadError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const raw = (loaded.value.research ?? {})[ownerId];
    if (raw === undefined) return err({ kind: "NoResearch", ownerId });

    const parsed = parse(raw, ownerId);
    if (!isOk(parsed)) return parsed;

    return ok(toResearchState(parsed.value));
  }
}
