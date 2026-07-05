/**
 * Composition root for the front-of-game UI. This is the ONE module allowed to
 * know both the concrete infrastructure adapters and the UI views — it wires
 * ports to implementations (constructor DI, no framework) and routes between
 * the menu, settings, and lobby screens by reconciling MainMenuController state
 * after each interaction. Untested composition glue: behaviour lives in the
 * tested controllers/views this file merely assembles.
 *
 * Host/Join/Solo resolve to loopback sessions today (netcode is M7); `onLaunch`
 * hands the resulting session to the engine entry so it can start the world.
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
import { createLocalizer } from "../ui/i18n/strings";
import { LobbyView } from "../ui/LobbyView";
import { MainMenuView } from "../ui/MainMenuView";
import { SettingsView } from "../ui/SettingsView";

export interface GameUiOptions {
  readonly locale?: Locale;
  readonly settingsStore?: SettingsStore;
  readonly persistentStorage?: PersistentStorage;
  readonly onLaunch?: (session: LoopbackSession) => void;
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
    options.onLaunch?.(session);
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
