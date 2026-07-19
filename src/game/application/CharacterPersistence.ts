/**
 * Use case: round-trip an owner's character (level/xp, attribute
 * allocation, talents) through the world save. Mirrors `ProgressionPersistence`
 * exactly — reads/writes the open `WorldSaveData.character` map keyed by
 * owner id, depends only on the {@link WorldSaveStore} port, and treats the
 * untyped blob as a trust boundary (err-explicit-result-handling) rather
 * than trusting its shape.
 *
 * `WorldSaveData.character` is optional (Phase E1 added it after the save
 * shape already existed) — a world saved before this phase, or an owner who
 * never opened the character screen, simply has no record; `load` reports
 * that as `NoCharacter` rather than a corrupt-data error, and the
 * composition root falls back to `newCharacter()` (identical behaviour to
 * today, cozy invariant: nothing regresses for an existing save).
 */

import { err, isOk, ok, type Result } from "../domain/Result";
import type { AttributeKey } from "../domain/character/CharacterStats";
import type { CharacterState } from "../domain/character/Character";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

interface SerializedCharacter {
  readonly level: number;
  readonly xp: number;
  readonly attributes: Readonly<Record<AttributeKey, number>>;
  readonly unspentStatPoints: number;
  readonly talentRanks: Readonly<Record<string, number>>;
  readonly unspentTalentPoints: number;
}

export type CharacterLoadError =
  | SaveError
  | { readonly kind: "NoCharacter"; readonly ownerId: string }
  | { readonly kind: "CorruptCharacter"; readonly ownerId: string; readonly detail: string };

const ATTRIBUTE_KEYS: readonly AttributeKey[] = ["vigor", "endurance", "might", "fortune"];

function serialize(character: CharacterState): SerializedCharacter {
  return {
    level: character.level.level,
    xp: character.level.xp,
    attributes: character.stats.attributes,
    unspentStatPoints: character.stats.unspentPoints,
    talentRanks: character.talents.ranks,
    unspentTalentPoints: character.talents.unspentPoints,
  };
}

function isNumberRecord(v: unknown): v is Record<string, number> {
  return (
    typeof v === "object" &&
    v !== null &&
    Object.values(v as Record<string, unknown>).every((x) => typeof x === "number")
  );
}

function parse(raw: unknown, ownerId: string): Result<SerializedCharacter, CharacterLoadError> {
  if (typeof raw !== "object" || raw === null) {
    return err({ kind: "CorruptCharacter", ownerId, detail: "not a character record" });
  }
  const record = raw as Partial<SerializedCharacter>;
  if (
    typeof record.level !== "number" ||
    typeof record.xp !== "number" ||
    typeof record.unspentStatPoints !== "number" ||
    typeof record.unspentTalentPoints !== "number" ||
    !isNumberRecord(record.attributes) ||
    !isNumberRecord(record.talentRanks)
  ) {
    return err({ kind: "CorruptCharacter", ownerId, detail: "bad character shape" });
  }
  for (const key of ATTRIBUTE_KEYS) {
    if (typeof (record.attributes as Record<string, number>)[key] !== "number") {
      return err({ kind: "CorruptCharacter", ownerId, detail: `missing attribute: ${key}` });
    }
  }
  return ok({
    level: record.level,
    xp: record.xp,
    attributes: record.attributes as Record<AttributeKey, number>,
    unspentStatPoints: record.unspentStatPoints,
    talentRanks: record.talentRanks as Record<string, number>,
    unspentTalentPoints: record.unspentTalentPoints,
  });
}

function toCharacterState(s: SerializedCharacter): CharacterState {
  return {
    level: { level: s.level, xp: s.xp },
    stats: { attributes: s.attributes, unspentPoints: s.unspentStatPoints },
    talents: { ranks: s.talentRanks, unspentPoints: s.unspentTalentPoints },
  };
}

export class CharacterPersistence {
  constructor(private readonly store: WorldSaveStore) {}

  async save(
    worldId: WorldId,
    ownerId: string,
    character: CharacterState,
  ): Promise<Result<void, SaveError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const next = { ...(loaded.value.character ?? {}), [ownerId]: serialize(character) };
    return this.store.save({ ...loaded.value, character: next, modifiedAt: Date.now() });
  }

  async load(worldId: WorldId, ownerId: string): Promise<Result<CharacterState, CharacterLoadError>> {
    const loaded = await this.store.load(worldId);
    if (!isOk(loaded)) return loaded;

    const raw = (loaded.value.character ?? {})[ownerId];
    if (raw === undefined) return err({ kind: "NoCharacter", ownerId });

    const parsed = parse(raw, ownerId);
    if (!isOk(parsed)) return parsed;

    return ok(toCharacterState(parsed.value));
  }
}
