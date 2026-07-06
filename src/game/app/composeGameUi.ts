/**
 * Composition root for the front-of-game UI. This is the ONE module allowed to
 * know both the concrete infrastructure adapters and the UI views — it wires
 * ports to implementations (constructor DI, no framework) and routes between
 * the menu, settings, and lobby screens by reconciling MainMenuController state
 * after each interaction. Untested composition glue: behaviour lives in the
 * tested controllers/views this file merely assembles.
 *
 * Host/Join/Solo resolve to loopback sessions today (netcode is M7). Each
 * session's worldId is resolved through WorldLifecycle into a WorldLaunch (seed +
 * saved player pose + delta save); `onLaunch` hands THAT to the engine entry so
 * it can boot the chosen world and restore where the player left off. Wiring the
 * engine side (src/main.ts booting from WorldLaunch, FlyCamera pose restore) is
 * the [F] handoff.
 */

import type { Locale } from "../domain/i18n/translate";
import { InMemorySeedVaultStore } from "../infrastructure/persistence/InMemorySeedVaultStore";
import { InMemoryWorldSaveStore } from "../infrastructure/persistence/InMemoryWorldSaveStore";
import { LocalStorageSettingsStore } from "../infrastructure/persistence/LocalStorageSettingsStore";
import { NavigatorPersistentStorage } from "../infrastructure/persistence/NavigatorPersistentStorage";
import type { SettingsStore } from "../application/ports/SettingsStore";
import type { PersistentStorage } from "../application/ports/PersistentStorage";
import { ensurePersistentStorage } from "../application/StoragePersistence";
import { LobbyController } from "../application/LobbyController";
import { MainMenuController } from "../application/MainMenuController";
import { SettingsController } from "../application/SettingsController";
import type { LoopbackSession } from "../application/LoopbackSession";
import type { MenuScreen } from "../application/MainMenuController";
import { WorldLifecycle, type WorldLaunch } from "../application/WorldLifecycle";
import { createLocalizer } from "../ui/i18n/strings";
import { LobbyView } from "../ui/LobbyView";
import { MainMenuView } from "../ui/MainMenuView";
import { SettingsView } from "../ui/SettingsView";

export interface GameUiOptions {
  readonly locale?: Locale;
  readonly settingsStore?: SettingsStore;
  readonly persistentStorage?: PersistentStorage;
  readonly onLaunch?: (launch: WorldLaunch) => void;
}

export interface GameUiHandle {
  readonly container: HTMLElement;
}

export function mountGameUi(
  container: HTMLElement,
  options: GameUiOptions = {},
): GameUiHandle {
  const worlds = new InMemoryWorldSaveStore();
  const seeds = new InMemorySeedVaultStore();
  const settingsStore = options.settingsStore ?? new LocalStorageSettingsStore();

  const menu = new MainMenuController(worlds);
  const lobby = new LobbyController(worlds, seeds);
  const lifecycle = new WorldLifecycle(worlds);
  const settings = new SettingsController(settingsStore);
  const persistentStorage =
    options.persistentStorage ?? new NavigatorPersistentStorage();
  const loc = createLocalizer(options.locale ?? "en");
  void settings.load();

  let mounted: MenuScreen | null = null;

  // Persist-permission is requested once, at the first world launch (= first
  // save), so a world is not LRU-evicted (research §7). The grant state is
  // surfaced in an aria-live status line.
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.className = "laas-storage-status";
  let persistRequested = false;

  const launch = (session: LoopbackSession) => {
    if (!persistRequested) {
      persistRequested = true;
      void ensurePersistentStorage(persistentStorage).then((r) => {
        status.textContent = r.persisted
          ? loc.t("storage.persisted")
          : loc.t("storage.notPersisted");
      });
    }
    // Resolve the session's world into the engine boot descriptor (seed + saved
    // pose + deltas), then hand it to the engine entry. A load failure of a
    // just-created world is an unexpected I/O fault — log it, don't transition.
    void lifecycle.launch(session.worldId).then((resolved) => {
      if (resolved.ok) options.onLaunch?.(resolved.value);
      // eslint-disable-next-line no-console
      else console.warn("[game] world launch failed", resolved.error);
    });
  };
  const toMenu = () => {
    menu.back();
    reconcile();
  };

  const show = (el: HTMLElement) => {
    container.replaceChildren(el, status);
  };

  function reconcile(): void {
    const screen = menu.screen;
    if (screen === mounted || screen === "solo") return;
    mounted = screen;
    if (screen === "settings") show(SettingsView(settings, loc, toMenu));
    else if (screen === "lobby") show(LobbyView(lobby, loc, launch, toMenu));
    else show(MainMenuView(menu, loc, launch));
  }

  container.addEventListener("click", () => queueMicrotask(reconcile));
  show(MainMenuView(menu, loc, launch));
  mounted = "menu";

  return { container };
}
