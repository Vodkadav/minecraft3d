/**
 * Character aggregate (Phase E1.4 wiring). Composes Leveling + CharacterStats
 * + TalentTree into one persistable/consumable unit, and exposes the
 * "multiplier-hook API": pure functions any future HUD/combat/gather call
 * site can read to scale a base value, without those call sites needing to
 * know about levels/attributes/talents individually.
 *
 * At `newCharacter()` every multiplier is exactly 1 — a stats-less save (or
 * a save with no `character` record at all, see CharacterPersistence)
 * behaves identically to today. Actually multiplying these into
 * `PlayerVitals`/`Survival`/combat-gather call sites is deferred to the
 * consuming phase (E2 HUD) the same way `InventoryPersistence`/
 * `ProgressionPersistence` were built and tested here before their engine
 * wiring landed — see PROGRESS.md.
 */

import type { ProgressionEventId } from "../progression/ProgressionEvents";
import {
  allocatePoint,
  type AttributeKey,
  type CharacterStatsState,
  emptyCharacterStats,
  grantStatPoints,
  lootMultiplier,
  maxEnergyMultiplier,
  maxHealthMultiplier,
  powerMultiplier,
  refundPoint,
  respecStats,
  type StatAllocationError,
} from "./CharacterStats";
import { grantXp, type LevelState, spawnLevelState, xpForEvent } from "./Leveling";
import {
  allocateTalent,
  emptyTalentTree,
  grantTalentPoints,
  respecTalents,
  TALENT_NODES,
  type TalentError,
  type TalentTreeState,
  totalBonus,
} from "./TalentTree";
import type { Result } from "../Result";

export interface CharacterState {
  readonly level: LevelState;
  readonly stats: CharacterStatsState;
  readonly talents: TalentTreeState;
}

export function newCharacter(): CharacterState {
  return { level: spawnLevelState(), stats: emptyCharacterStats(), talents: emptyTalentTree() };
}

export interface GrantCharacterXpResult {
  readonly character: CharacterState;
  readonly levelsGained: number;
}

/** Grants XP and, on every level gained, one stat point AND one talent
 *  point (cozy: level-up always feels rewarding on both fronts). */
export function grantCharacterXp(character: CharacterState, amount: number): GrantCharacterXpResult {
  const xpResult = grantXp(character.level, amount);
  if (xpResult.levelsGained === 0) {
    return { character: { ...character, level: xpResult.state }, levelsGained: 0 };
  }
  return {
    character: {
      level: xpResult.state,
      stats: grantStatPoints(character.stats, xpResult.pointsGranted),
      talents: grantTalentPoints(character.talents, xpResult.pointsGranted),
    },
    levelsGained: xpResult.levelsGained,
  };
}

/** Convenience: grant XP for one occurrence of an existing `ProgressionEventId`
 *  (dig/craft/place/tame/kill/eat/sleep/harvest) — the same event a call
 *  site already fires into `recordProgressionEvent`/`onProgress`. */
export function grantXpForEvent(
  character: CharacterState,
  event: ProgressionEventId,
): GrantCharacterXpResult {
  return grantCharacterXp(character, xpForEvent(event));
}

export function allocateStatPoint(
  character: CharacterState,
  attribute: AttributeKey,
): Result<CharacterState, StatAllocationError> {
  const r = allocatePoint(character.stats, attribute);
  if (!r.ok) return r;
  return { ok: true, value: { ...character, stats: r.value } };
}

export function refundStatPoint(
  character: CharacterState,
  attribute: AttributeKey,
): Result<CharacterState, StatAllocationError> {
  const r = refundPoint(character.stats, attribute);
  if (!r.ok) return r;
  return { ok: true, value: { ...character, stats: r.value } };
}

/** Free, total stat respec — talents are untouched. */
export function respecCharacterStats(character: CharacterState): CharacterState {
  return { ...character, stats: respecStats(character.stats) };
}

export function allocateCharacterTalent(
  character: CharacterState,
  nodeId: string,
): Result<CharacterState, TalentError> {
  const r = allocateTalent(TALENT_NODES, character.talents, nodeId, character.level.level);
  if (!r.ok) return r;
  return { ok: true, value: { ...character, talents: r.value } };
}

/** Free, total talent respec — attribute stats are untouched. */
export function respecCharacterTalents(character: CharacterState): CharacterState {
  return { ...character, talents: respecTalents(character.talents) };
}

// ---- The multiplier-hook API (E2 orbs/HUD, E5 party frames read from this) ----

/** `PLAYER_MAX_HEALTH * this` = the character's effective max health. */
export function effectiveMaxHealthMultiplier(character: CharacterState): number {
  return maxHealthMultiplier(character.stats.attributes) * (1 + totalBonus(TALENT_NODES, character.talents, "maxHealth"));
}

/** `STAMINA_MAX * this` = the character's effective max energy/stamina. */
export function effectiveMaxEnergyMultiplier(character: CharacterState): number {
  return maxEnergyMultiplier(character.stats.attributes) * (1 + totalBonus(TALENT_NODES, character.talents, "maxEnergy"));
}

/** `baseAttackDamage * this` = effective attack power. */
export function effectiveAttackPowerMultiplier(character: CharacterState): number {
  return powerMultiplier(character.stats.attributes) * (1 + totalBonus(TALENT_NODES, character.talents, "attackPower"));
}

/** `baseGatherYield * this` = effective gather power. */
export function effectiveGatherPowerMultiplier(character: CharacterState): number {
  return powerMultiplier(character.stats.attributes) * (1 + totalBonus(TALENT_NODES, character.talents, "gatherPower"));
}

/** `baseLootAmount * this` = effective loot/find. */
export function effectiveLootMultiplier(character: CharacterState): number {
  return lootMultiplier(character.stats.attributes) * (1 + totalBonus(TALENT_NODES, character.talents, "loot"));
}
