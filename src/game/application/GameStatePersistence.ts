/**
 * Boot-load / save-trigger composition over `InventoryPersistence` +
 * `ProgressionPersistence` (S7b — closes the S4/S6 "tested, never wired"
 * deferral). One call on scene boot restores whatever was saved (or `null`
 * fields on a brand-new world/owner — never throws, matches the "keep
 * playing on a corrupt/missing save" posture the rest of persistence uses);
 * one call at each existing world-save trigger (pagehide/visibilitychange)
 * persists the live in-memory state. Best-effort: a save failure is logged,
 * never thrown — losing a few seconds of inventory/progression on a flush
 * error is preferable to crashing the tab mid-play.
 *
 * `characterPersistence` (Phase E1) is OPTIONAL — the one existing call site
 * (`TerrainScene.ts`, engine dir) constructs this without it, so a
 * stats-less boot keeps working unchanged; omitting it simply reports
 * `character: null` from `load()` and skips the character write in `save()`.
 */

import type { CharacterState } from "../domain/character/Character";
import type { Inventory } from "../domain/inventory/Inventory";
import type { KeyhintState } from "../domain/progression/Keyhints";
import type { ProgressionState } from "../domain/progression/ProgressionState";
import type { WorldId } from "../domain/world/WorldSaveData";
import type { CharacterPersistence } from "./CharacterPersistence";
import { InventoryPersistence } from "./InventoryPersistence";
import { ProgressionPersistence } from "./ProgressionPersistence";

export interface GameStatePersistenceDeps {
  readonly inventoryPersistence: InventoryPersistence;
  readonly progressionPersistence: ProgressionPersistence;
  readonly characterPersistence?: CharacterPersistence;
}

export interface LoadedGameState {
  readonly inventory: Inventory | null;
  readonly progression: ProgressionState | null;
  readonly keyhints: KeyhintState | null;
  readonly character: CharacterState | null;
}

export class GameStatePersistence {
  constructor(private readonly deps: GameStatePersistenceDeps) {}

  /** Never throws/rejects — a missing-save or corrupt-save owner boots as if
   *  nothing was saved (the composition root's existing empty defaults). */
  async load(worldId: WorldId, ownerId: string): Promise<LoadedGameState> {
    const [inv, prog, char] = await Promise.all([
      this.deps.inventoryPersistence.loadInventory(worldId, ownerId),
      this.deps.progressionPersistence.load(worldId, ownerId),
      this.deps.characterPersistence?.load(worldId, ownerId) ?? Promise.resolve(null),
    ]);
    return {
      inventory: inv.ok ? inv.value : null,
      progression: prog.ok ? prog.value.progression : null,
      keyhints: prog.ok ? prog.value.keyhints : null,
      character: char && char.ok ? char.value : null,
    };
  }

  /** Sequenced, not parallel: each call is its own read-modify-write of the
   *  SAME world record (`WorldSaveStore.load` then `.save`) — running them
   *  concurrently would race and lose whichever wrote second. */
  async save(
    worldId: WorldId,
    ownerId: string,
    inventory: Inventory,
    progression: ProgressionState,
    keyhints: KeyhintState,
    character?: CharacterState,
  ): Promise<void> {
    const inv = await this.deps.inventoryPersistence.saveInventory(worldId, ownerId, inventory);
    if (!inv.ok) console.warn("game-state save: inventory failed", inv.error);
    const prog = await this.deps.progressionPersistence.save(worldId, ownerId, progression, keyhints);
    if (!prog.ok) console.warn("game-state save: progression failed", prog.error);
    if (character && this.deps.characterPersistence) {
      const char = await this.deps.characterPersistence.save(worldId, ownerId, character);
      if (!char.ok) console.warn("game-state save: character failed", char.error);
    }
  }
}
