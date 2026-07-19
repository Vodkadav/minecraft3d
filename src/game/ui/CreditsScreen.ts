/**
 * Credits screen (Workstream 10.3) — reachable from the main menu. Lists the
 * runtime tech and the third-party CC0/MIT assets recorded in CREDITS.md
 * (`creditsData.ts` mirrors both sources), plus a "made with" attribution
 * line. Themed with the same Panel/Button kit as every other menu screen.
 */

import type { Localizer } from "../application/i18n/Localizer";
import type { AudioPort } from "../application/ports/AudioPort";
import { ASSET_CREDITS, TECH_CREDITS, type CreditEntry } from "./creditsData";
import { Button } from "./components/Button";
import { Panel } from "./components/Panel";
import { wireButtonSound } from "./audioUi";
import { injectStyles } from "./styles";

function list(doc: Document, entries: readonly CreditEntry[]): HTMLElement {
  const ul = doc.createElement("ul");
  ul.className = "lw-credits-list";
  for (const entry of entries) {
    const li = doc.createElement("li");
    const link = doc.createElement("a");
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = entry.name;
    const note = doc.createElement("span");
    note.className = "lw-credits-note";
    note.textContent = ` — ${entry.note}`;
    li.append(link, note);
    ul.appendChild(li);
  }
  return ul;
}

export function CreditsScreen(
  loc: Localizer,
  onBack?: () => void,
  audio?: AudioPort,
): HTMLElement {
  const doc = document;
  injectStyles(doc);

  const heading = doc.createElement("h1");
  heading.textContent = loc.t("credits.title");

  const techHeading = doc.createElement("h2");
  techHeading.textContent = loc.t("credits.tech");

  const assetsHeading = doc.createElement("h2");
  assetsHeading.textContent = loc.t("credits.assets");

  const madeWith = doc.createElement("p");
  madeWith.className = "lw-credits-madewith";
  madeWith.textContent = loc.t("credits.madeWith");

  const back = Button({ label: loc.t("credits.back"), variant: "quiet", onClick: () => onBack?.() });
  wireButtonSound(back, audio);

  const panel = Panel(
    [heading, techHeading, list(doc, TECH_CREDITS), assetsHeading, list(doc, ASSET_CREDITS), madeWith, back],
    { ariaLabel: loc.t("credits.title"), className: "laas-credits" },
  );
  return panel;
}
