/**
 * Multiplayer lobby use case (M4). Lists joinable worlds, hosts a new world
 * from a saved seed, and joins an existing world. Netcode is M7, so hosting
 * writes a world through the WorldSaveStore and both host/join resolve to a
 * local loopback session — every button reaches a real handler today, and the
 * transport swaps in later without changing this contract.
 *
 * Depends only on ports (WorldSaveStore + SeedVaultStore); the composition root
 * injects concrete adapters. Expected failures are Result values.
 */

import { err, isErr, ok, type Result } from "../domain/Result";
import type { SeedEntry } from "../domain/seedvault/SeedVault";
import { createNewWorldSave } from "../domain/world/NewWorldSave";
import type { WorldId, WorldSummary } from "../domain/world/WorldSaveData";
import type { LoopbackSession } from "./LoopbackSession";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";
import type {
  SeedVaultStore,
  SeedVaultStoreError,
} from "./ports/SeedVaultStore";

export type LobbyError =
  | SaveError
  | SeedVaultStoreError
  | { readonly kind: "UnknownSeed"; readonly id: string };

export interface LobbyDeps {
  readonly clock?: () => number;
  readonly idFactory?: () => string;
}

export class LobbyController {
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly worlds: WorldSaveStore,
    private readonly seeds: SeedVaultStore,
    deps: LobbyDeps = {},
  ) {
    this.clock = deps.clock ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => crypto.randomUUID());
  }

  async listWorlds(): Promise<Result<readonly WorldSummary[], LobbyError>> {
    return this.worlds.list();
  }

  async listSeeds(): Promise<Result<readonly SeedEntry[], LobbyError>> {
    return this.seeds.list();
  }

  async host(seedVaultEntryId: string): Promise<Result<LoopbackSession, LobbyError>> {
    const listed = await this.seeds.list();
    if (isErr(listed)) return listed;
    const entry = listed.value.find((e) => e.id === seedVaultEntryId);
    if (!entry) return err({ kind: "UnknownSeed", id: seedVaultEntryId });

    const save = createNewWorldSave({
      worldId: this.idFactory(),
      seed: entry.seed,
      name: entry.name,
      now: this.clock(),
    });
    const saved = await this.worlds.save(save);
    if (isErr(saved)) return saved;
    return ok({ worldId: save.worldId, mode: "loopback" });
  }

  async join(worldId: WorldId): Promise<Result<LoopbackSession, LobbyError>> {
    const loaded = await this.worlds.load(worldId);
    if (isErr(loaded)) return loaded;
    return ok({ worldId, mode: "loopback" });
  }
}
