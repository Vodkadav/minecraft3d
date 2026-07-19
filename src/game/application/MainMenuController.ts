/**
 * Front-of-game navigation use case: the three main-menu intents (Solo, Online,
 * Settings) plus back. A thin state/intent holder — it owns the current screen
 * and, for Solo, starts an offline single-player loopback world from a chosen
 * seed (via the WorldSaveStore port). Online/Settings just switch screen; their
 * screens own their controllers, wired at the composition root.
 */

import { isErr, ok, type Result } from "../domain/Result";
import { createNewWorldSave } from "../domain/world/NewWorldSave";
import type { LoopbackSession } from "./LoopbackSession";
import type { SaveError, WorldSaveStore } from "./ports/WorldSaveStore";

export type MenuScreen = "menu" | "settings" | "lobby" | "solo" | "credits";

export interface MainMenuDeps {
  readonly clock?: () => number;
  readonly idFactory?: () => string;
}

export class MainMenuController {
  private _screen: MenuScreen = "menu";
  private _session: LoopbackSession | null = null;
  private readonly clock: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly worlds: WorldSaveStore,
    deps: MainMenuDeps = {},
  ) {
    this.clock = deps.clock ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => crypto.randomUUID());
  }

  get screen(): MenuScreen {
    return this._screen;
  }

  get session(): LoopbackSession | null {
    return this._session;
  }

  openOnline(): void {
    this._screen = "lobby";
  }

  openSettings(): void {
    this._screen = "settings";
  }

  openCredits(): void {
    this._screen = "credits";
  }

  back(): void {
    this._screen = "menu";
  }

  async startSolo(seed: number, name: string): Promise<Result<LoopbackSession, SaveError>> {
    const save = createNewWorldSave({
      worldId: this.idFactory(),
      seed,
      name,
      now: this.clock(),
    });
    const saved = await this.worlds.save(save);
    if (isErr(saved)) return saved;
    const session: LoopbackSession = { worldId: save.worldId, mode: "loopback" };
    this._session = session;
    this._screen = "solo";
    return ok(session);
  }
}
