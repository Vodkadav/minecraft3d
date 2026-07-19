/**
 * Main-menu DOM shell: Solo / Online / Settings, each a real <button> wired to
 * a MainMenuController intent. Solo starts an offline loopback world (with a
 * fresh seed) and reports the resulting session to the host via `onSession` so
 * the app can launch gameplay. All labels come through the Localizer.
 */

import type { Localizer } from "../application/i18n/Localizer";
import type { MainMenuController } from "../application/MainMenuController";
import type { LoopbackSession } from "../application/LoopbackSession";
import type { AudioPort } from "../application/ports/AudioPort";
import { wireButtonSound } from "./audioUi";
import { injectStyles } from "./styles";

const SEED_MAX = 2 ** 31;

export function MainMenuView(
  controller: MainMenuController,
  loc: Localizer,
  onSession?: (session: LoopbackSession) => void,
  audio?: AudioPort,
): HTMLElement {
  const doc = document;
  injectStyles(doc);

  const root = doc.createElement("section");
  root.className = "laas-ui laas-main-menu";
  root.setAttribute("aria-label", loc.t("app.title"));

  const heading = doc.createElement("h1");
  heading.textContent = loc.t("app.title");
  root.appendChild(heading);

  const nav = doc.createElement("nav");
  nav.setAttribute("aria-label", loc.t("app.title"));

  const solo = doc.createElement("button");
  solo.type = "button";
  solo.textContent = loc.t("menu.solo");
  solo.setAttribute("aria-label", loc.t("menu.solo.aria"));
  solo.addEventListener("click", () => {
    const seed = Math.floor(Math.random() * SEED_MAX);
    void controller.startSolo(seed, loc.t("world.defaultName")).then((r) => {
      if (r.ok && onSession) onSession(r.value);
    });
  });

  const online = doc.createElement("button");
  online.type = "button";
  online.textContent = loc.t("menu.online");
  online.addEventListener("click", () => controller.openOnline());

  const settings = doc.createElement("button");
  settings.type = "button";
  settings.textContent = loc.t("menu.settings");
  settings.addEventListener("click", () => controller.openSettings());

  nav.append(solo, online, settings);
  root.appendChild(nav);
  for (const btn of [solo, online, settings]) wireButtonSound(btn, audio);
  return root;
}
