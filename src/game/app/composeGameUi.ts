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
import type { SettingsStore } from "../application/ports/SettingsStore";
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
  const loc = createLocalizer(options.locale ?? "en");
  void settings.load();

  let mounted: MenuScreen | null = null;

  const launch = (session: LoopbackSession) => options.onLaunch?.(session);
  const toMenu = () => {
    menu.back();
    reconcile();
  };

  const show = (el: HTMLElement) => {
    container.replaceChildren(el);
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
