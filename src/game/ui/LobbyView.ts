/**
 * Online-lobby DOM shell, modelled on a Colyseus LobbyRoom's live world list: a
 * scrollable list of joinable worlds (each row a Join button), and below it Back
 * and Host. Host opens a picker of locally-saved seeds; choosing one creates the
 * world (loopback) and it appears in the list, joinable. Join/Host success are
 * reported to the host app via `onSession` so it can launch gameplay.
 *
 * Netcode is M7; today Host/Join resolve to a local loopback session, but every
 * button reaches a real LobbyController handler. Labels via the Localizer.
 */

import type { Localizer } from "../application/i18n/Localizer";
import type { LobbyController } from "../application/LobbyController";
import type { LoopbackSession } from "../application/LoopbackSession";
import type { AudioPort } from "../application/ports/AudioPort";
import { isValidRoomCode } from "../domain/net/RoomCode";
import type { WorldSummary } from "../domain/world/WorldSaveData";
import type { SeedEntry } from "../domain/seedvault/SeedVault";
import { wireButtonSound } from "./audioUi";
import { injectStyles } from "./styles";

export function LobbyView(
  controller: LobbyController,
  loc: Localizer,
  onSession?: (session: LoopbackSession) => void,
  onBack?: () => void,
  onJoinByCode?: (code: string) => Promise<boolean>,
  audio?: AudioPort,
): HTMLElement {
  const doc = document;
  injectStyles(doc);

  const root = doc.createElement("section");
  root.className = "laas-ui laas-lobby";
  root.setAttribute("aria-label", loc.t("lobby.title"));

  const heading = doc.createElement("h1");
  heading.textContent = loc.t("lobby.title");
  root.appendChild(heading);

  // M7 join-by-code (ADR 0002 §4): a friend's invite code beats any list.
  // Only rendered when the host app wires the real net path in.
  if (onJoinByCode) {
    const row = doc.createElement("div");
    row.className = "laas-code-row";

    const label = doc.createElement("label");
    label.textContent = loc.t("lobby.code.label");
    label.htmlFor = "laas-code-input";

    const input = doc.createElement("input");
    input.type = "text";
    input.id = "laas-code-input";
    input.className = "laas-code-input";
    input.placeholder = loc.t("lobby.code.placeholder");
    input.maxLength = 8;
    input.autocapitalize = "characters";
    input.spellcheck = false;

    const joinByCode = doc.createElement("button");
    joinByCode.type = "button";
    joinByCode.textContent = loc.t("lobby.code.join");

    const codeStatus = doc.createElement("p");
    codeStatus.className = "laas-code-status";
    codeStatus.setAttribute("role", "status");
    codeStatus.setAttribute("aria-live", "polite");

    joinByCode.addEventListener("click", () => {
      const code = input.value.trim().toUpperCase();
      if (!isValidRoomCode(code)) {
        codeStatus.textContent = loc.t("lobby.code.invalid");
        return;
      }
      joinByCode.disabled = true;
      codeStatus.textContent = loc.t("lobby.code.connecting");
      void onJoinByCode(code).then((launched) => {
        if (launched) return; // the host app tears the menu down
        joinByCode.disabled = false;
        codeStatus.textContent = loc.t("lobby.code.failed");
      });
    });

    wireButtonSound(joinByCode, audio);
    row.append(label, input, joinByCode);
    root.append(row, codeStatus);
  }

  const worldsHeading = doc.createElement("h2");
  worldsHeading.id = "laas-worlds-heading";
  worldsHeading.textContent = loc.t("lobby.worlds");
  root.appendChild(worldsHeading);

  const list = doc.createElement("ul");
  list.className = "laas-world-list";
  list.setAttribute("role", "list");
  list.setAttribute("aria-labelledby", "laas-worlds-heading");
  root.appendChild(list);

  const picker = doc.createElement("div");
  picker.className = "laas-seed-picker";
  picker.hidden = true;
  root.appendChild(picker);

  const footer = doc.createElement("div");
  footer.className = "laas-lobby-footer";

  const back = doc.createElement("button");
  back.type = "button";
  back.textContent = loc.t("lobby.back");
  back.addEventListener("click", () => onBack?.());

  const host = doc.createElement("button");
  host.type = "button";
  host.textContent = loc.t("lobby.host");
  host.addEventListener("click", () => void openPicker());

  footer.append(back, host);
  root.appendChild(footer);
  wireButtonSound(back, audio);
  wireButtonSound(host, audio);

  function renderWorlds(worlds: readonly WorldSummary[]): void {
    list.replaceChildren();
    if (worlds.length === 0) {
      const empty = doc.createElement("li");
      empty.className = "laas-world-empty";
      empty.textContent = loc.t("lobby.empty");
      list.appendChild(empty);
      return;
    }
    for (const world of worlds) {
      const row = doc.createElement("li");
      row.className = "laas-world-row";
      const name = doc.createElement("span");
      name.className = "laas-world-name";
      name.textContent = world.name;
      const join = doc.createElement("button");
      join.type = "button";
      join.textContent = loc.t("lobby.join");
      join.setAttribute("aria-label", loc.t("lobby.join.aria", { name: world.name }));
      join.addEventListener("click", () => {
        void controller.join(world.worldId).then((r) => {
          if (r.ok && onSession) onSession(r.value);
        });
      });
      row.append(name, join);
      wireButtonSound(join, audio);
      list.appendChild(row);
    }
  }

  function renderSeeds(seeds: readonly SeedEntry[]): void {
    picker.replaceChildren();
    const prompt = doc.createElement("p");
    prompt.textContent = loc.t("lobby.pickSeed");
    picker.appendChild(prompt);
    if (seeds.length === 0) {
      const none = doc.createElement("p");
      none.textContent = loc.t("lobby.seed.none");
      picker.appendChild(none);
      return;
    }
    for (const seed of seeds) {
      const use = doc.createElement("button");
      use.type = "button";
      use.className = "laas-seed-option";
      use.textContent = loc.t("lobby.seed.use", { name: seed.name });
      use.addEventListener("click", () => void hostWith(seed.id));
      wireButtonSound(use, audio);
      picker.appendChild(use);
    }
  }

  async function refresh(): Promise<void> {
    const r = await controller.listWorlds();
    if (r.ok) renderWorlds(r.value);
  }

  async function openPicker(): Promise<void> {
    const r = await controller.listSeeds();
    if (!r.ok) return;
    renderSeeds(r.value);
    picker.hidden = false;
  }

  async function hostWith(seedId: string): Promise<void> {
    const r = await controller.host(seedId);
    if (!r.ok) return;
    picker.hidden = true;
    picker.replaceChildren();
    await refresh();
    if (onSession) onSession(r.value);
  }

  void refresh();
  return root;
}
